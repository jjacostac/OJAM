// Validación del cuerpo de un reporte (formulario público y carga
// manual del admin). Devuelve { datos } o { error }.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

const LIMITES = {
  nombre_problematica: 200,
  municipio: 100,
  descripcion: 10000,
  actores_involucrados: 2000,
  contacto_reportante: 200
};

function texto(valor, max) {
  if (valor === null || valor === undefined) return null;
  const s = String(valor).trim();
  if (!s) return null;
  return s.slice(0, max);
}

export function validarReporte(body) {
  if (!body || typeof body !== 'object') {
    return { error: 'Cuerpo de la petición vacío o inválido.' };
  }

  const nombre = texto(body.nombre_problematica, LIMITES.nombre_problematica);
  const municipio = texto(body.municipio, LIMITES.municipio);
  const descripcion = texto(body.descripcion, LIMITES.descripcion);
  const actores = texto(body.actores_involucrados, LIMITES.actores_involucrados);
  const lon = Number(body.lon);
  const lat = Number(body.lat);
  const categoria = String(body.categoria_id ?? '').trim();
  const esAnonimo = body.es_anonimo === true || body.es_anonimo === 'true';
  const fecha = texto(body.fecha_ocurrencia, 10);

  if (!nombre) return { error: 'Falta el nombre de la problemática.' };
  if (!municipio) return { error: 'Falta el municipio.' };
  if (!descripcion) return { error: 'Falta la descripción.' };
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
    return { error: 'Faltan las coordenadas de la ubicación.' };
  }
  if (lon < -180 || lon > 180 || lat < -90 || lat > 90) {
    return { error: 'Coordenadas fuera de rango.' };
  }
  if (!UUID_RE.test(categoria)) {
    return { error: 'Tipo de injusticia inválido: selecciona una categoría de la lista.' };
  }
  if (fecha && !FECHA_RE.test(fecha)) {
    return { error: 'Fecha de ocurrencia inválida (formato AAAA-MM-DD).' };
  }

  // Si el reporte es anónimo, el contacto se descarta desde ya
  // (la base de datos lo garantiza de nuevo con CHECK + trigger).
  const contacto = esAnonimo
    ? null
    : texto(body.contacto_reportante, LIMITES.contacto_reportante);

  return {
    datos: {
      p_nombre: nombre,
      p_municipio: municipio,
      p_lon: lon,
      p_lat: lat,
      p_descripcion: descripcion,
      p_fecha: fecha || null,
      p_actores: actores,
      p_categoria: categoria,
      p_es_anonimo: esAnonimo,
      p_contacto: contacto
    }
  };
}
