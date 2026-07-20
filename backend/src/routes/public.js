import { Router } from 'express';
import { supabase } from '../lib/supabase.js';
import { validarReporte } from '../lib/validar.js';
import { aCSV, aGeoJSON } from '../lib/export.js';
import { limiteLectura, limiteEnvio } from '../middleware/rate-limit.js';

// Rutas públicas: sin autenticación. Solo tocan las vistas
// sanitizadas (reportes_publicos / categorias_publicas), que por
// diseño no contienen contacto_reportante ni reportes sin aprobar.

export const rutasPublicas = Router();

rutasPublicas.use(limiteLectura);

// Categorías con contador de casos aprobados (panel y desplegables).
rutasPublicas.get('/categorias', async (_req, res) => {
  const { data, error } = await supabase
    .from('categorias_publicas')
    .select('*')
    .order('orden');
  if (error) return res.status(500).json({ error: 'Error consultando categorías.' });
  res.set('Cache-Control', 'public, max-age=300');
  res.json(data);
});

// Casos aprobados como GeoJSON (lo que pinta el mapa).
rutasPublicas.get('/reportes', async (_req, res) => {
  const { data, error } = await supabase
    .from('reportes_publicos')
    .select('*')
    .order('creado_en', { ascending: false });
  if (error) return res.status(500).json({ error: 'Error consultando reportes.' });
  res.set('Cache-Control', 'public, max-age=120');
  res.json(
    aGeoJSON(data, (r) => ({
      id: r.id,
      nombre_problematica: r.nombre_problematica,
      municipio: r.municipio,
      descripcion: r.descripcion,
      fecha_ocurrencia: r.fecha_ocurrencia,
      actores_involucrados: r.actores_involucrados,
      categoria_id: r.categoria_id,
      creado_en: r.creado_en
    }))
  );
});

// Alta de un reporte ciudadano → entra SIEMPRE en estado 'pendiente'
// con canal 'web'. `creado_en` lo pone la base de datos.
rutasPublicas.post('/reportes', limiteEnvio, async (req, res) => {
  const { datos, error: errorValidacion } = validarReporte(req.body);
  if (errorValidacion) return res.status(400).json({ error: errorValidacion });

  const { data, error } = await supabase.rpc('crear_reporte', {
    ...datos,
    p_canal: 'web'
  });
  if (error) {
    console.error('crear_reporte:', error.message);
    return res.status(500).json({ error: 'No se pudo guardar el reporte. Intenta de nuevo.' });
  }
  res.status(201).json({ id: data, estado: 'pendiente' });
});

// Exportación de datos abiertos (solo lo público/aprobado).
rutasPublicas.get('/export', async (req, res) => {
  const formato = req.query.formato === 'csv' ? 'csv' : 'geojson';

  const [reportes, categorias] = await Promise.all([
    supabase.from('reportes_publicos').select('*').order('creado_en'),
    supabase.from('categorias_publicas').select('id, nombre')
  ]);
  if (reportes.error || categorias.error) {
    return res.status(500).json({ error: 'Error generando la exportación.' });
  }

  const nombreCategoria = new Map(categorias.data.map((c) => [c.id, c.nombre]));
  const filas = reportes.data.map((r) => ({
    ...r,
    tipo_injusticia: nombreCategoria.get(r.categoria_id) ?? ''
  }));

  const fecha = new Date().toISOString().slice(0, 10);
  if (formato === 'csv') {
    const csv = aCSV(filas, [
      { campo: 'id', titulo: 'id' },
      { campo: 'nombre_problematica', titulo: 'nombre_problematica' },
      { campo: 'municipio', titulo: 'municipio' },
      { campo: 'lat', titulo: 'latitud' },
      { campo: 'lon', titulo: 'longitud' },
      { campo: 'tipo_injusticia', titulo: 'tipo_injusticia' },
      { campo: 'fecha_ocurrencia', titulo: 'fecha_ocurrencia' },
      { campo: 'actores_involucrados', titulo: 'actores_involucrados' },
      { campo: 'descripcion', titulo: 'descripcion' },
      { campo: 'creado_en', titulo: 'fecha_publicacion' }
    ]);
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="ojam-datos-abiertos-${fecha}.csv"`);
    return res.send(csv);
  }

  res.set('Content-Type', 'application/geo+json');
  res.set('Content-Disposition', `attachment; filename="ojam-datos-abiertos-${fecha}.geojson"`);
  res.json(
    aGeoJSON(filas, (r) => ({
      id: r.id,
      nombre_problematica: r.nombre_problematica,
      municipio: r.municipio,
      tipo_injusticia: r.tipo_injusticia,
      fecha_ocurrencia: r.fecha_ocurrencia,
      actores_involucrados: r.actores_involucrados,
      descripcion: r.descripcion,
      creado_en: r.creado_en
    }))
  );
});
