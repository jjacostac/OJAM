// Punto de entrada de la vista pública: carga de datos, enrutado de
// subvistas (history API con hash — funciona en cualquier hosting
// estático sin configurar redirecciones) y registro de la PWA.

import { CONFIG } from './config.js';
import { api } from './api.js';
import { estado, aplicarFiltros, bus } from './estado.js';
import { initMapa, invalidarTamano } from './map.js';
import { initFiltros } from './filters.js';
import { initPanel, renderLista, renderDetalle } from './panel.js';
import { initFormulario, alAbrirFormulario } from './report-form.js';
import { descargarCSV, descargarGeoJSON } from './export.js';
import { contarPendientes, reintentarTodos } from './offline-queue.js';
import { avisar } from './avisos.js';

const $ = (sel) => document.querySelector(sel);

async function arrancar() {
  document.title = `${CONFIG.NOMBRE_CORTO} — ${CONFIG.NOMBRE_LARGO}`;

  // Límites municipales: asset local, imprescindible para dibujar.
  // El contorno del departamento (halo) es opcional: si falta, se omite.
  let limites;
  let contorno = null;
  try {
    limites = await fetch(CONFIG.ARCHIVO_LIMITES).then((r) => r.json());
    contorno = await fetch(CONFIG.ARCHIVO_CONTORNO)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
  } catch (error) {
    console.error(error);
    $('#panel-contenido').innerHTML =
      '<p class="panel-vacio">No se pudo cargar el mapa base del departamento. ' +
      'Recarga la página.</p>';
    ocultarPantallaCarga();
    return;
  }

  // Categorías y casos (API): si el servidor de datos no responde
  // (sin señal, backend dormido o aún sin desplegar), el mapa y la
  // interfaz cargan igual, vacíos y con aviso — nunca una página rota.
  const [categorias, reportes] = await Promise.allSettled([
    api.categorias(),
    api.reportes()
  ]);

  if (categorias.status === 'fulfilled') {
    estado.categorias = new Map(categorias.value.map((c) => [c.id, c]));
  }
  if (reportes.status === 'fulfilled') {
    estado.casos = reportes.value.features.map((f) => ({
      ...f.properties,
      lon: f.geometry.coordinates[0],
      lat: f.geometry.coordinates[1]
    }));
  }
  if (categorias.status === 'rejected' || reportes.status === 'rejected') {
    console.error(categorias.reason ?? reportes.reason);
    avisar(
      'No se pudo conectar con el servidor de datos. El mapa se muestra ' +
      'sin casos; se reintentará al recargar.',
      'pendiente',
      8000
    );
  }

  estado.municipios = limites.features
    .map((f) => f.properties.nombre)
    .sort((a, b) => a.localeCompare(b, 'es'));
  estado.casosFiltrados = [...estado.casos];

  initMapa(limites, contorno);
  initFiltros();
  initPanel();
  initFormulario();
  renderLista();

  // Botones bajo el panel lateral.
  $('#btn-csv').addEventListener('click', descargarCSV);
  $('#btn-geojson').addEventListener('click', descargarGeoJSON);
  $('#btn-agregar').addEventListener('click', () => navegar('#/reportar'));

  // Enrutado de subvistas.
  bus.addEventListener('mostrar-detalle', (e) => {
    history.pushState(null, '', `#/caso/${e.detail.id}`);
    ajustarVista('mapa');
    renderDetalle(e.detail);
  });
  bus.addEventListener('cerrar-detalle', () => {
    history.pushState(null, '', location.pathname);
    ajustarVista('mapa');
    renderLista();
  });
  window.addEventListener('popstate', () => enrutar(false));
  enrutar(false);

  aplicarFiltros();
  ocultarPantallaCarga();
  prepararOffline();
  registrarServiceWorker();
}

// La pantalla "Cargando la plataforma…" cubre la interfaz desde el
// primer instante (está en el HTML); se retira cuando el mapa y los
// datos ya están en pantalla — o si la carga falla, para mostrar el
// mensaje de error.
function ocultarPantallaCarga() {
  const pantalla = $('#pantalla-carga');
  if (!pantalla) return;
  pantalla.style.opacity = '0';
  pantalla.style.transition = 'opacity .3s ease';
  setTimeout(() => pantalla.remove(), 320);
}

function navegar(hash) {
  history.pushState(null, '', hash);
  enrutar(true);
}

function enrutar(esNavegacionInterna) {
  const hash = location.hash;
  const caso = hash.startsWith('#/caso/')
    ? estado.casos.find((c) => c.id === hash.slice(7))
    : null;

  if (hash === '#/reportar') {
    ajustarVista('formulario');
    alAbrirFormulario();
  } else if (caso) {
    ajustarVista('mapa');
    renderDetalle(caso);
  } else {
    ajustarVista('mapa');
    renderLista();
  }
  if (!esNavegacionInterna) window.scrollTo(0, 0);
}

function ajustarVista(vista) {
  const anterior = document.body.dataset.vista;
  document.body.dataset.vista = vista;
  // Al volver del formulario, el contenedor del mapa recupera su
  // tamaño: Leaflet debe recalcular sin volver a pedir teselas.
  if (anterior === 'formulario' && vista === 'mapa') invalidarTamano();
}

// --- Cola offline: reintento al volver la señal ------------------
async function prepararOffline() {
  const reintentar = async () => {
    const enviados = await reintentarTodos((r) => api.crearReporte(r));
    if (enviados > 0) {
      avisar(
        enviados === 1
          ? 'Se envió 1 reporte que estaba guardado sin conexión.'
          : `Se enviaron ${enviados} reportes guardados sin conexión.`,
        'exito'
      );
    }
  };
  window.addEventListener('online', reintentar);
  const pendientes = await contarPendientes().catch(() => 0);
  if (pendientes > 0) {
    if (navigator.onLine) {
      reintentar();
    } else {
      avisar(`${pendientes} reporte(s) esperando conexión para enviarse.`, 'pendiente');
    }
  }
}

function registrarServiceWorker() {
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch((e) => {
      console.warn('Service worker no registrado:', e.message);
    });
  }
}

arrancar();
