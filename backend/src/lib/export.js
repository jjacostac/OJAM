// Serialización de datos a CSV y GeoJSON para descargas.

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

/**
 * @param {Array<object>} rows
 * @param {Array<{campo: string, titulo: string}>} columnas
 * @returns {string} CSV con BOM UTF-8 (para que Excel lea bien las tildes)
 */
export function aCSV(rows, columnas) {
  const cabecera = columnas.map((c) => csvEscape(c.titulo)).join(',');
  const lineas = rows.map((r) =>
    columnas.map((c) => csvEscape(r[c.campo])).join(',')
  );
  return '﻿' + [cabecera, ...lineas].join('\r\n');
}

/**
 * @param {Array<object>} rows — filas con campos lon/lat numéricos
 * @param {(row: object) => object} propiedades — mapea fila → properties
 */
export function aGeoJSON(rows, propiedades) {
  return {
    type: 'FeatureCollection',
    features: rows.map((r) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [r.lon, r.lat] },
      properties: propiedades(r)
    }))
  };
}
