// Mapa principal (Leaflet). Estilo cartográfico inspirado en la
// paleta observada en EJAtlas: tierra beige, mar azul claro,
// vegetación verde, vías naranja — logrado con un ajuste de color
// CSS sobre las teselas de OpenStreetMap (cero peso extra).
/* global L */

import { CONFIG } from './config.js';
import { estado, emitir, bus } from './estado.js';

let mapa;
let capaMarcadores;
let marcadoresPorId = new Map();
let idSeleccionado = null;

export function initMapa(limites, contorno = null) {
  mapa = L.map('mapa', {
    center: CONFIG.MAPA.centro,
    zoom: CONFIG.MAPA.zoom,
    minZoom: CONFIG.MAPA.zoomMinimo,
    maxZoom: CONFIG.MAPA.zoomMaximo,
    zoomControl: false, // se agrega abajo, junto al selector de capas
    attributionControl: false,
    // Los vectores (contorno, límites municipales, puntos) se dibujan
    // con 2 pantallas extra de margen alrededor del encuadre: al
    // arrastrar o hacer zoom, las líneas ya están pintadas en vez de
    // aparecer cortadas donde terminaba la vista. Con la geometría
    // ligera que usamos (~10 mil vértices) el costo es despreciable.
    renderer: L.svg({ padding: 2 })
  });

  // --- Mapas base -------------------------------------------------
  // "Mapa OJAM": teselas CARTO Voyager SIN rótulos — así los únicos
  // nombres de municipio son los propios (negrita + halo), sin
  // duplicados, y el mar se ve plano, sin fronteras marítimas.
  // "OpenStreetMap (detallado)": alternativa con todos los rótulos
  // y detalle de calles, para quien lo necesite.
  const atribucionComun =
    `${CONFIG.NOMBRE_CORTO} / © colaboradores de <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>`;

  const baseOjam = L.tileLayer(
    'https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png',
    {
      attribution: `${atribucionComun} · © <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>`,
      subdomains: 'abcd',
      maxZoom: 19,
      // Conserva más teselas vecinas al mover/zoom: menos huecos.
      keepBuffer: 4,
      updateWhenZooming: false
    }
  );
  const baseDetallada = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: atribucionComun,
    maxZoom: 19,
    keepBuffer: 4,
    updateWhenZooming: false
  });

  baseOjam.addTo(mapa);
  mapa.getContainer().classList.add('estilo-ejatlas');

  // Capa de identidad OJAM: contorno del departamento, líneas de
  // municipios y nombres propios. Solo acompaña al "Mapa OJAM": la
  // opción "OpenStreetMap (detallado)" se muestra limpia, sin
  // líneas de separación y con los rótulos nativos de OSM.
  const capaIdentidad = L.layerGroup().addTo(mapa);

  mapa.on('baselayerchange', (e) => {
    const esOjam = e.layer === baseOjam;
    mapa.getContainer().classList.toggle('estilo-ejatlas', esOjam);
    if (esOjam) capaIdentidad.addTo(mapa);
    else mapa.removeLayer(capaIdentidad);
  });

  // --- Logo OJAM sobre el mapa (esquina superior izquierda) ------
  const LogoMapa = L.Control.extend({
    options: { position: 'topleft' },
    onAdd() {
      const div = L.DomUtil.create('div', 'logo-mapa');
      div.innerHTML = `<img src="assets/logo-redondo.png" alt="${CONFIG.NOMBRE_CORTO}" width="66" height="66">`;
      return div;
    }
  });
  mapa.addControl(new LogoMapa());

  // --- Contorno del departamento: jade con halo blanco suave -----
  if (contorno) {
    capaIdentidad.addLayer(
      L.geoJSON(contorno, {
        interactive: false,
        style: {
          color: '#66B695', // jade: esmeralda grisáceo con brillo natural
          weight: 2.5,
          opacity: 0.95,
          fill: false,
          className: 'contorno-departamento'
        }
      })
    );
  }

  // --- Límites municipales (DANE) --------------------------------
  // Línea punteada gris, mismo tratamiento que EJAtlas da a las
  // fronteras administrativas.
  capaIdentidad.addLayer(
    L.geoJSON(limites, {
      interactive: false,
      style: {
        color: '#6b7280',
        weight: 1.1,
        dashArray: '4 3',
        fill: false,
        opacity: 0.85
      }
    })
  );

  // Nombres de municipios: negrita + halo blanco + color propio,
  // distinto del texto de corregimientos del mapa base. Mejora
  // deliberada sobre EJAtlas para lectura en campo (pantallas
  // pequeñas, luz solar directa).
  const etiquetas = L.layerGroup();
  for (const rasgo of limites.features) {
    const centro = L.geoJSON(rasgo).getBounds().getCenter();
    etiquetas.addLayer(
      L.marker(centro, {
        interactive: false,
        keyboard: false,
        icon: L.divIcon({
          className: 'etiqueta-municipio',
          html: rasgo.properties.nombre,
          iconSize: null
        })
      })
    );
  }
  capaIdentidad.addLayer(etiquetas);
  const actualizarEtiquetas = () => {
    mapa.getContainer().classList.toggle(
      'sin-etiquetas',
      mapa.getZoom() < CONFIG.MAPA.zoomEtiquetas
    );
  };
  mapa.on('zoomend', actualizarEtiquetas);
  actualizarEtiquetas();

  // Encuadre inicial: el departamento completo.
  mapa.fitBounds(L.geoJSON(limites).getBounds(), { padding: [12, 12] });

  // --- Leyenda de categorías (superpuesta, esquina inferior izq.) -
  const Leyenda = L.Control.extend({
    options: { position: 'bottomleft' },
    onAdd() {
      const div = L.DomUtil.create('div', 'leyenda');
      const filas = [...estado.categorias.values()]
        .map(
          (c) =>
            `<span class="leyenda-fila"><span class="leyenda-punto" style="background:${c.color_hex}"></span>${escaparHTML(c.nombre)}</span>`
        )
        .join('');
      div.innerHTML = `<strong>Categorías</strong>${filas}`;
      return div;
    }
  });
  mapa.addControl(new Leyenda());

  // --- Controles de la esquina inferior izquierda ----------------
  // En las esquinas inferiores Leaflet apila: el primero agregado
  // queda ABAJO. Orden visual (abajo → arriba): leyenda Categorías,
  // zoom (+/−) y encima el selector de capas — sin taparse.
  L.control.zoom({ position: 'bottomleft' }).addTo(mapa);
  L.control
    .layers(
      { 'Mapa OJAM': baseOjam, 'OpenStreetMap (detallado)': baseDetallada },
      null,
      { position: 'bottomleft', collapsed: true }
    )
    .addTo(mapa);

  // --- Atribución personalizada ----------------------------------
  const atrib = L.control.attribution({ position: 'bottomright', prefix: 'Leaflet' });
  atrib.addAttribution(
    `${atribucionComun} · Datos abiertos <a href="https://creativecommons.org/licenses/by/4.0/deed.es" target="_blank" rel="noopener" aria-label="Licencia Creative Commons Atribución 4.0">CC BY 4.0</a> · <a href="#" id="btn-mapa-completo">Ver mapa con más detalles</a>`
  );
  atrib.addTo(mapa);
  document.addEventListener('click', (e) => {
    if (e.target.id === 'btn-mapa-completo') {
      e.preventDefault();
      alternarPantallaCompleta();
    }
  });

  // --- Capa de marcadores ----------------------------------------
  capaMarcadores = L.layerGroup().addTo(mapa);

  mapa.on('moveend', () => emitir('mapa-movido'));

  bus.addEventListener('filtros-cambiados', pintarMarcadores);
  bus.addEventListener('mostrar-detalle', (e) => {
    seleccionar(e.detail?.id ?? null);
    if (e.detail) {
      const punto = L.latLng(e.detail.lat, e.detail.lon);
      if (!mapa.getBounds().contains(punto)) mapa.panTo(punto);
    }
  });
  bus.addEventListener('cerrar-detalle', () => seleccionar(null));

  pintarMarcadores();
}

// Cada conflicto se pinta con el color de su categoría, leído de la
// base de datos (tabla categorias) — nunca hardcodeado.
function pintarMarcadores() {
  capaMarcadores.clearLayers();
  marcadoresPorId = new Map();

  for (const caso of estado.casosFiltrados) {
    const color = estado.categorias.get(caso.categoria_id)?.color_hex ?? '#4b5563';
    const marcador = L.circleMarker([caso.lat, caso.lon], {
      radius: caso.id === idSeleccionado ? 10 : 7,
      color: '#ffffff',
      weight: 2,
      fillColor: color,
      fillOpacity: 0.92
    });
    marcador.bindTooltip(caso.nombre_problematica, { direction: 'top', offset: [0, -6] });
    marcador.on('click', () => emitir('mostrar-detalle', caso));
    marcador.addTo(capaMarcadores);
    marcadoresPorId.set(caso.id, marcador);
  }
}

function seleccionar(id) {
  if (idSeleccionado && marcadoresPorId.has(idSeleccionado)) {
    marcadoresPorId.get(idSeleccionado).setStyle({ radius: 7 }).setRadius(7);
  }
  idSeleccionado = id;
  if (id && marcadoresPorId.has(id)) {
    marcadoresPorId.get(id).setRadius(10).bringToFront();
  }
}

/** Casos filtrados que además están dentro del encuadre actual. */
export function casosEnVista() {
  if (!mapa) return estado.casosFiltrados;
  const limites = mapa.getBounds();
  return estado.casosFiltrados.filter((c) => limites.contains([c.lat, c.lon]));
}

export function invalidarTamano() {
  if (mapa) setTimeout(() => mapa.invalidateSize(), 60);
}

function alternarPantallaCompleta() {
  document.body.classList.toggle('mapa-completo');
  invalidarTamano();
}

// --- Minimapa selector de punto (formulario y panel admin) -------
export function crearSelectorPunto(idContenedor, alCambiar) {
  const mini = L.map(idContenedor, {
    center: CONFIG.MAPA.centro,
    zoom: CONFIG.MAPA.zoom - 1,
    minZoom: CONFIG.MAPA.zoomMinimo,
    maxZoom: CONFIG.MAPA.zoomMaximo
  });
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap',
    maxZoom: 19
  }).addTo(mini);

  let pin = null;
  const icono = L.divIcon({
    className: 'pin-seleccion',
    html: '<span></span>',
    iconSize: [22, 22],
    iconAnchor: [11, 22]
  });

  function fijar(lat, lon, centrar = false) {
    if (!pin) {
      pin = L.marker([lat, lon], { draggable: true, icon: icono }).addTo(mini);
      pin.on('dragend', () => {
        const p = pin.getLatLng();
        alCambiar(p.lat, p.lng);
      });
    } else {
      pin.setLatLng([lat, lon]);
    }
    if (centrar) mini.setView([lat, lon], Math.max(mini.getZoom(), 13));
    alCambiar(lat, lon);
  }

  mini.on('click', (e) => fijar(e.latlng.lat, e.latlng.lng));

  return {
    fijar,
    invalidar: () => setTimeout(() => mini.invalidateSize(), 60),
    obtener: () => (pin ? { lat: pin.getLatLng().lat, lon: pin.getLatLng().lng } : null)
  };
}

export function escaparHTML(texto) {
  const div = document.createElement('div');
  div.textContent = texto ?? '';
  return div.innerHTML;
}
