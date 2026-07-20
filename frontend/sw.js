// Service worker de OJAM.
// Estrategia pensada para señal débil o intermitente:
//  - Cascarón de la app (HTML/CSS/JS/GeoJSON): cache-first → la
//    segunda visita abre al instante aun sin señal.
//  - Teselas del mapa ya vistas: stale-while-revalidate con tope →
//    el territorio que la persona ya exploró sigue visible offline.
//  - API: network-first con respaldo en caché → si no hay señal se
//    muestran los últimos casos conocidos.
//  - Cola de reportes: Background Sync reenvía lo guardado en
//    IndexedDB aunque la página esté cerrada.

const VERSION = 'v11';
const CACHE_APP = `ojam-app-${VERSION}`;
const CACHE_TILES = `ojam-tiles-${VERSION}`;
const CACHE_API = `ojam-api-${VERSION}`;
const MAX_TESELAS = 400;

const CASCARON = [
  './',
  'index.html',
  'admin.html',
  'manifest.webmanifest',
  'css/base.css',
  'css/map.css',
  'css/admin.css',
  'js/app.js',
  'js/config.js',
  'js/api.js',
  'js/estado.js',
  'js/map.js',
  'js/filters.js',
  'js/panel.js',
  'js/report-form.js',
  'js/offline-queue.js',
  'js/export.js',
  'js/avisos.js',
  'js/admin/admin.js',
  'vendor/leaflet/leaflet.js',
  'vendor/leaflet/leaflet.css',
  'vendor/leaflet/images/layers.png',
  'vendor/leaflet/images/layers-2x.png',
  'assets/logo.svg',
  'assets/logo-redondo.png',
  'assets/logo-cuadrado.svg',
  'assets/icons/icon.svg',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
  'assets/icons/categorias/mineria.svg',
  'assets/icons/categorias/agua.svg',
  'assets/icons/categorias/default.svg',
  'assets/partners/aliado-1.svg',
  'assets/partners/aliado-2.svg',
  'assets/partners/aliado-3.svg',
  'assets/geo/municipios-magdalena.geojson',
  'assets/geo/magdalena-contorno.geojson'
];

const HOSTS_TESELAS = ['tile.openstreetmap.org', 'basemaps.cartocdn.com'];

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(CACHE_APP).then((cache) => cache.addAll(CASCARON)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((claves) =>
        Promise.all(
          claves
            .filter((c) => c.startsWith('ojam-') && ![CACHE_APP, CACHE_TILES, CACHE_API].includes(c))
            .map((c) => caches.delete(c))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (evento) => {
  const peticion = evento.request;
  if (peticion.method !== 'GET') return;

  const url = new URL(peticion.url);

  if (HOSTS_TESELAS.some((h) => url.hostname.endsWith(h))) {
    evento.respondWith(teselas(peticion));
    return;
  }

  if (url.pathname.startsWith('/api/')) {
    evento.respondWith(redPrimero(peticion));
    return;
  }

  if (url.origin === location.origin) {
    evento.respondWith(cachePrimero(peticion));
  }
});

async function cachePrimero(peticion) {
  const enCache = await caches.match(peticion, { ignoreSearch: true });
  if (enCache) return enCache;
  const respuesta = await fetch(peticion);
  if (respuesta.ok) {
    const cache = await caches.open(CACHE_APP);
    cache.put(peticion, respuesta.clone());
  }
  return respuesta;
}

async function redPrimero(peticion) {
  const cache = await caches.open(CACHE_API);
  // Las respuestas de administración (con token) no se cachean.
  const esPrivada = Boolean(peticion.headers.get('Authorization'));
  try {
    const respuesta = await fetch(peticion);
    if (respuesta.ok && !esPrivada) cache.put(peticion, respuesta.clone());
    return respuesta;
  } catch (error) {
    const respaldo = await cache.match(peticion);
    if (respaldo) return respaldo;
    throw error;
  }
}

// Teselas: responde de caché al instante y refresca en segundo
// plano. Tope de entradas para no crecer sin límite en el teléfono.
async function teselas(peticion) {
  const cache = await caches.open(CACHE_TILES);
  const enCache = await cache.match(peticion);
  const refresco = fetch(peticion)
    .then((respuesta) => {
      if (respuesta.ok) {
        cache.put(peticion, respuesta.clone()).then(() => recortarCache(cache));
      }
      return respuesta;
    })
    .catch(() => enCache);
  return enCache || refresco;
}

async function recortarCache(cache) {
  const claves = await cache.keys();
  if (claves.length > MAX_TESELAS) {
    await Promise.all(claves.slice(0, claves.length - MAX_TESELAS).map((c) => cache.delete(c)));
  }
}

// --- Background Sync: reenviar reportes guardados sin señal ------

self.addEventListener('sync', (evento) => {
  if (evento.tag === 'ojam-sync-reportes') {
    evento.waitUntil(reenviarCola());
  }
});

function abrirBD() {
  return new Promise((resolver, rechazar) => {
    const solicitud = indexedDB.open('ojam', 1);
    solicitud.onsuccess = () => resolver(solicitud.result);
    solicitud.onerror = () => rechazar(solicitud.error);
  });
}

function leerTodo(db, almacen) {
  return new Promise((resolver, rechazar) => {
    const tx = db.transaction(almacen, 'readonly');
    const solicitud = tx.objectStore(almacen).getAll();
    solicitud.onsuccess = () => resolver(solicitud.result);
    solicitud.onerror = () => rechazar(solicitud.error);
  });
}

function borrar(db, almacen, clave) {
  return new Promise((resolver, rechazar) => {
    const tx = db.transaction(almacen, 'readwrite');
    tx.objectStore(almacen).delete(clave);
    tx.oncomplete = resolver;
    tx.onerror = () => rechazar(tx.error);
  });
}

function leerConfig(db, clave) {
  return new Promise((resolver) => {
    try {
      const tx = db.transaction('config', 'readonly');
      const solicitud = tx.objectStore('config').get(clave);
      solicitud.onsuccess = () => resolver(solicitud.result?.valor ?? null);
      solicitud.onerror = () => resolver(null);
    } catch {
      resolver(null);
    }
  });
}

async function reenviarCola() {
  const db = await abrirBD();
  const apiUrl = await leerConfig(db, 'api_url');
  if (!apiUrl) return;
  const pendientes = await leerTodo(db, 'cola_reportes');
  for (const item of pendientes) {
    try {
      const respuesta = await fetch(`${apiUrl}/api/reportes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item.reporte)
      });
      // Enviado, o rechazado definitivamente por el servidor (4xx):
      // en ambos casos sale de la cola. Error de red: se conserva.
      if (respuesta.ok || (respuesta.status >= 400 && respuesta.status < 500)) {
        await borrar(db, 'cola_reportes', item.clave);
      }
    } catch {
      // Sigue sin señal: Background Sync reintentará más adelante.
    }
  }
}
