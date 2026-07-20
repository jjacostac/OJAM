// Panel lateral derecho con dos estados (referencia: EJAtlas):
//   1. Lista de tarjetas, una por caso visible en el mapa.
//   2. Detalle de un caso (clic en punto o en tarjeta).
// Más la flecha colapsable para dejar el mapa a pantalla completa.

import { estado, emitir, bus } from './estado.js';
import { casosEnVista, invalidarTamano } from './map.js';

const $ = (sel) => document.querySelector(sel);
let modo = 'lista'; // 'lista' | 'detalle'
let casoActual = null;

export function initPanel() {
  $('#btn-colapsar').addEventListener('click', () => {
    const colapsado = document.body.classList.toggle('panel-colapsado');
    const boton = $('#btn-colapsar');
    boton.setAttribute('aria-expanded', String(!colapsado));
    boton.textContent = colapsado ? '«' : '»';
    boton.title = colapsado ? 'Mostrar panel de casos' : 'Ocultar panel de casos';
    invalidarTamano();
  });

  bus.addEventListener('filtros-cambiados', () => {
    if (modo === 'lista') renderLista();
  });
  bus.addEventListener('mapa-movido', () => {
    if (modo === 'lista') renderLista();
  });
}

export function renderLista() {
  modo = 'lista';
  casoActual = null;
  const contenedor = $('#panel-contenido');
  contenedor.textContent = '';

  const visibles = casosEnVista();
  const titulo = document.createElement('h2');
  titulo.className = 'panel-titulo';
  titulo.textContent = `Casos en el mapa (${visibles.length})`;
  contenedor.append(titulo);

  if (visibles.length === 0) {
    const vacio = document.createElement('p');
    vacio.className = 'panel-vacio';
    vacio.textContent = estado.casos.length === 0
      ? 'Aún no hay casos publicados. Sé la primera persona en reportar una injusticia ambiental.'
      : 'Ningún caso coincide con los filtros en esta zona del mapa. Mueve el mapa o ajusta los filtros.';
    contenedor.append(vacio);
    return;
  }

  const lista = document.createElement('ul');
  lista.className = 'tarjetas';
  for (const caso of visibles) {
    lista.append(tarjeta(caso));
  }
  contenedor.append(lista);
}

function tarjeta(caso) {
  const categoria = estado.categorias.get(caso.categoria_id);
  const item = document.createElement('li');
  const boton = document.createElement('button');
  boton.type = 'button';
  boton.className = 'tarjeta';

  // Sin fotos en esta fase: la miniatura es el ícono de la categoría
  // sobre su color.
  const icono = document.createElement('span');
  icono.className = 'tarjeta-icono';
  icono.style.background = categoria?.color_hex ?? '#4b5563';
  const img = document.createElement('img');
  img.src = `assets/icons/categorias/${categoria?.icono ?? 'default'}.svg`;
  img.alt = '';
  img.width = 26;
  img.height = 26;
  img.addEventListener('error', () => {
    img.src = 'assets/icons/categorias/default.svg';
  }, { once: true });
  icono.append(img);

  const cuerpo = document.createElement('span');
  cuerpo.className = 'tarjeta-cuerpo';

  const titulo = document.createElement('span');
  titulo.className = 'tarjeta-titulo';
  titulo.textContent = caso.nombre_problematica;

  const fragmento = document.createElement('span');
  fragmento.className = 'tarjeta-fragmento';
  fragmento.textContent = caso.descripcion;

  const meta = document.createElement('span');
  meta.className = 'tarjeta-meta';
  meta.textContent = [caso.municipio, formatearFecha(caso.fecha_ocurrencia)]
    .filter(Boolean)
    .join(' · ');

  cuerpo.append(titulo, fragmento, meta);
  boton.append(icono, cuerpo);
  boton.addEventListener('click', () => emitir('mostrar-detalle', caso));
  item.append(boton);
  return item;
}

export function renderDetalle(caso) {
  modo = 'detalle';
  casoActual = caso;
  const categoria = estado.categorias.get(caso.categoria_id);
  const contenedor = $('#panel-contenido');
  contenedor.textContent = '';

  const volver = document.createElement('button');
  volver.type = 'button';
  volver.className = 'btn-volver';
  volver.textContent = '← Volver a la lista';
  volver.addEventListener('click', () => emitir('cerrar-detalle'));
  contenedor.append(volver);

  const titulo = document.createElement('h2');
  titulo.className = 'detalle-titulo';
  titulo.tabIndex = -1;
  titulo.textContent = caso.nombre_problematica;
  contenedor.append(titulo);

  const chip = document.createElement('p');
  chip.className = 'detalle-chip';
  chip.innerHTML = `<span class="leyenda-punto" style="background:${categoria?.color_hex ?? '#4b5563'}"></span>`;
  chip.append(document.createTextNode(categoria?.nombre ?? 'Sin categoría'));
  contenedor.append(chip);

  // Ficha de datos
  const ficha = document.createElement('dl');
  ficha.className = 'ficha';
  const filas = [
    ['Municipio', caso.municipio],
    ['Fecha de ocurrencia', formatearFecha(caso.fecha_ocurrencia) || 'No indicada'],
    ['Tipo de injusticia', categoria?.nombre ?? '—'],
    ['Actores involucrados', caso.actores_involucrados || 'No indicados'],
    ['Publicado', formatearFecha((caso.creado_en || '').slice(0, 10))]
  ];
  for (const [termino, valor] of filas) {
    const dt = document.createElement('dt');
    dt.textContent = termino;
    const dd = document.createElement('dd');
    dd.textContent = valor ?? '—';
    ficha.append(dt, dd);
  }
  contenedor.append(ficha);

  const subDesc = document.createElement('h3');
  subDesc.className = 'detalle-sub';
  subDesc.textContent = 'Descripción';
  contenedor.append(subDesc);

  const descripcion = document.createElement('div');
  descripcion.className = 'detalle-descripcion';
  for (const parrafo of String(caso.descripcion || '').split(/\n{2,}/)) {
    const p = document.createElement('p');
    p.append(...enlazarURLs(parrafo));
    descripcion.append(p);
  }
  contenedor.append(descripcion);

  // Fuentes: hipervínculos detectados en el texto del reporte.
  const urls = extraerURLs(`${caso.descripcion || ''} ${caso.actores_involucrados || ''}`);
  if (urls.length > 0) {
    const subFuentes = document.createElement('h3');
    subFuentes.className = 'detalle-sub';
    subFuentes.textContent = 'Fuentes y enlaces';
    contenedor.append(subFuentes);

    const listaFuentes = document.createElement('ul');
    listaFuentes.className = 'fuentes';
    for (const url of urls) {
      const li = document.createElement('li');
      li.append(crearEnlace(url));
      listaFuentes.append(li);
    }
    contenedor.append(listaFuentes);
  }

  titulo.focus();
  contenedor.scrollTop = 0;
}

export function detalleAbierto() {
  return modo === 'detalle' ? casoActual : null;
}

// --- utilidades --------------------------------------------------

const URL_RE = /https?:\/\/[^\s<>"')\]]+/g;

function extraerURLs(texto) {
  return [...new Set(texto.match(URL_RE) || [])];
}

// Convierte texto plano en nodos, con las URLs como <a> seguros
// (nunca innerHTML sobre contenido enviado por la ciudadanía).
function enlazarURLs(texto) {
  const nodos = [];
  let resto = texto;
  let m;
  URL_RE.lastIndex = 0;
  while ((m = URL_RE.exec(texto)) !== null) {
    const antes = texto.slice(nodos._corte ?? 0, m.index);
    if (antes) nodos.push(document.createTextNode(antes));
    nodos.push(crearEnlace(m[0]));
    nodos._corte = m.index + m[0].length;
  }
  resto = texto.slice(nodos._corte ?? 0);
  if (resto) nodos.push(document.createTextNode(resto));
  delete nodos._corte;
  return nodos;
}

function crearEnlace(url) {
  const a = document.createElement('a');
  a.href = url;
  a.textContent = url.replace(/^https?:\/\//, '').replace(/\/$/, '');
  a.target = '_blank';
  a.rel = 'noopener noreferrer nofollow';
  return a;
}

function formatearFecha(iso) {
  if (!iso) return '';
  const [a, m, d] = iso.split('-').map(Number);
  if (!a || !m || !d) return iso;
  const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return `${d} ${meses[m - 1]} ${a}`;
}
