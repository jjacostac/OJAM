// Descarga de datos abiertos desde el navegador: exporta los casos
// que pasan los filtros actuales (lo que la persona está viendo),
// sin viaje extra al servidor. Solo datos públicos: aquí nunca
// llegan contactos ni reportes sin aprobar.

import { estado } from './estado.js';

function nombreCategoria(caso) {
  return estado.categorias.get(caso.categoria_id)?.nombre ?? '';
}

function descargar(nombre, contenido, tipo) {
  const blob = new Blob([contenido], { type: tipo });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  enlace.click();
  URL.revokeObjectURL(url);
}

function csvEscapar(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

export function descargarCSV() {
  const columnas = [
    'id', 'nombre_problematica', 'municipio', 'latitud', 'longitud',
    'tipo_injusticia', 'fecha_ocurrencia', 'actores_involucrados',
    'descripcion', 'fecha_publicacion'
  ];
  const lineas = estado.casosFiltrados.map((c) =>
    [
      c.id, c.nombre_problematica, c.municipio, c.lat, c.lon,
      nombreCategoria(c), c.fecha_ocurrencia, c.actores_involucrados,
      c.descripcion, c.creado_en
    ].map(csvEscapar).join(',')
  );
  const csv = '﻿' + [columnas.join(','), ...lineas].join('\r\n');
  descargar(`ojam-casos-${hoy()}.csv`, csv, 'text/csv;charset=utf-8');
}

export function descargarGeoJSON() {
  const coleccion = {
    type: 'FeatureCollection',
    features: estado.casosFiltrados.map((c) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [c.lon, c.lat] },
      properties: {
        id: c.id,
        nombre_problematica: c.nombre_problematica,
        municipio: c.municipio,
        tipo_injusticia: nombreCategoria(c),
        fecha_ocurrencia: c.fecha_ocurrencia,
        actores_involucrados: c.actores_involucrados,
        descripcion: c.descripcion,
        fecha_publicacion: c.creado_en
      }
    }))
  };
  descargar(`ojam-casos-${hoy()}.geojson`, JSON.stringify(coleccion, null, 1), 'application/geo+json');
}

function hoy() {
  return new Date().toISOString().slice(0, 10);
}
