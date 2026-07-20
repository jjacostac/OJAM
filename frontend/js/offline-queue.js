// Cola de reportes pendientes de envío, en IndexedDB (persistente
// dentro de la PWA, sobrevive cierres del navegador). Si el envío
// falla por falta de señal, el reporte espera aquí y se reintenta
// al volver la conexión — desde la app o desde el service worker
// (Background Sync), lo que ocurra primero.

import { CONFIG } from './config.js';

const BD = 'ojam';
const ALMACEN = 'cola_reportes';

function abrirBD() {
  return new Promise((resolver, rechazar) => {
    const solicitud = indexedDB.open(BD, 1);
    solicitud.onupgradeneeded = () => {
      const db = solicitud.result;
      if (!db.objectStoreNames.contains(ALMACEN)) {
        db.createObjectStore(ALMACEN, { keyPath: 'clave', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('config')) {
        db.createObjectStore('config', { keyPath: 'clave' });
      }
    };
    solicitud.onsuccess = () => resolver(solicitud.result);
    solicitud.onerror = () => rechazar(solicitud.error);
  });
}

function transaccion(db, modo, accion) {
  return new Promise((resolver, rechazar) => {
    const tx = db.transaction(ALMACEN, modo);
    const resultado = accion(tx.objectStore(ALMACEN));
    tx.oncomplete = () => resolver(resultado.result ?? resultado);
    tx.onerror = () => rechazar(tx.error);
  });
}

export async function encolar(reporte) {
  const db = await abrirBD();
  await transaccion(db, 'readwrite', (s) => s.add({ reporte, guardado_en: Date.now() }));
  // Deja anotada la URL de la API para que el service worker pueda
  // reenviar sin depender de que la página esté abierta.
  await new Promise((resolver) => {
    const tx = db.transaction('config', 'readwrite');
    tx.objectStore('config').put({ clave: 'api_url', valor: CONFIG.API_URL });
    tx.oncomplete = resolver;
  });
  if ('serviceWorker' in navigator && 'SyncManager' in window) {
    try {
      const registro = await navigator.serviceWorker.ready;
      await registro.sync.register('ojam-sync-reportes');
    } catch {
      // Sin Background Sync: el reintento correrá al volver el evento 'online'.
    }
  }
}

export async function contarPendientes() {
  const db = await abrirBD();
  return transaccion(db, 'readonly', (s) => s.count());
}

/**
 * Reintenta enviar todo lo encolado. Devuelve cuántos salieron.
 * Un rechazo del servidor (4xx) descarta el reporte (no va a
 * reintentarse para siempre); un fallo de red lo conserva.
 */
export async function reintentarTodos(enviar) {
  const db = await abrirBD();
  const pendientes = await transaccion(db, 'readonly', (s) => s.getAll());
  let enviados = 0;
  for (const item of pendientes) {
    try {
      await enviar(item.reporte);
      await transaccion(db, 'readwrite', (s) => s.delete(item.clave));
      enviados++;
    } catch (error) {
      if (error?.estado >= 400 && error.estado < 500) {
        await transaccion(db, 'readwrite', (s) => s.delete(item.clave));
        console.warn('Reporte encolado descartado por el servidor:', error.message);
      }
      // Error de red: se queda en cola para el próximo intento.
    }
  }
  return enviados;
}
