import { Router } from 'express';
import { supabase } from '../lib/supabase.js';
import { validarReporte } from '../lib/validar.js';
import { aCSV, aGeoJSON } from '../lib/export.js';
import { requiereAdmin } from '../middleware/auth.js';

// Rutas de administración: exigen sesión de Supabase Auth con un
// correo de la lista ADMIN_EMAIL. Aquí sí se ven todos los campos
// (incluido contacto_reportante) y todos los estados.

export const rutasAdmin = Router();

rutasAdmin.use(requiereAdmin);

const ESTADOS = ['pendiente', 'aprobado', 'rechazado'];

// --- Cola de moderación y listados -------------------------------

rutasAdmin.get('/reportes', async (req, res) => {
  let consulta = supabase
    .from('reportes_admin')
    .select('*')
    .order('creado_en', { ascending: false });
  if (ESTADOS.includes(req.query.estado)) {
    consulta = consulta.eq('estado', req.query.estado);
  }
  const { data, error } = await consulta;
  if (error) return res.status(500).json({ error: 'Error consultando reportes.' });
  res.json(data);
});

// Aprobar / rechazar (o devolver a pendiente). Queda en auditoría
// vía trigger; la nota opcional acompaña el registro.
rutasAdmin.post('/reportes/:id/estado', async (req, res) => {
  const { estado, nota } = req.body ?? {};
  if (!ESTADOS.includes(estado)) {
    return res.status(400).json({ error: `Estado inválido. Usa: ${ESTADOS.join(', ')}.` });
  }
  const { error } = await supabase.rpc('admin_cambiar_estado', {
    p_id: req.params.id,
    p_estado: estado,
    p_admin: req.admin.id,
    p_nota: typeof nota === 'string' && nota.trim() ? nota.trim().slice(0, 1000) : null
  });
  if (error) {
    console.error('admin_cambiar_estado:', error.message);
    return res.status(500).json({ error: 'No se pudo cambiar el estado.' });
  }
  res.json({ ok: true });
});

// Carga manual de un reporte recibido por el canal de WhatsApp:
// mismos campos que el formulario público, canal fijado aquí.
rutasAdmin.post('/reportes', async (req, res) => {
  const { datos, error: errorValidacion } = validarReporte(req.body);
  if (errorValidacion) return res.status(400).json({ error: errorValidacion });

  const { data, error } = await supabase.rpc('crear_reporte', {
    ...datos,
    p_canal: 'whatsapp'
  });
  if (error) {
    console.error('crear_reporte (whatsapp):', error.message);
    return res.status(500).json({ error: 'No se pudo guardar el reporte.' });
  }
  res.status(201).json({ id: data, estado: 'pendiente' });
});

// Corrección de un reporte: campos de texto y/o ubicación (mover pin).
rutasAdmin.patch('/reportes/:id', async (req, res) => {
  const b = req.body ?? {};
  const cambios = {};
  for (const campo of [
    'nombre_problematica', 'municipio', 'descripcion',
    'fecha_ocurrencia', 'actores_involucrados', 'categoria_id'
  ]) {
    if (b[campo] !== undefined) {
      cambios[campo] = typeof b[campo] === 'string' ? b[campo].trim() || null : b[campo];
    }
  }

  if (Object.keys(cambios).length > 0) {
    const { error } = await supabase
      .from('reportes')
      .update(cambios)
      .eq('id', req.params.id);
    if (error) {
      console.error('editar reporte:', error.message);
      return res.status(500).json({ error: 'No se pudieron guardar los cambios.' });
    }
  }

  if (b.lon !== undefined && b.lat !== undefined) {
    const lon = Number(b.lon);
    const lat = Number(b.lat);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
      return res.status(400).json({ error: 'Coordenadas inválidas.' });
    }
    const { error } = await supabase.rpc('admin_mover_reporte', {
      p_id: req.params.id,
      p_lon: lon,
      p_lat: lat
    });
    if (error) {
      console.error('admin_mover_reporte:', error.message);
      return res.status(500).json({ error: 'No se pudo mover el punto.' });
    }
  }

  res.json({ ok: true });
});

// Historial de auditoría de un reporte.
rutasAdmin.get('/reportes/:id/auditoria', async (req, res) => {
  const { data, error } = await supabase
    .from('auditoria_reportes')
    .select('*')
    .eq('reporte_id', req.params.id)
    .order('fecha_cambio');
  if (error) return res.status(500).json({ error: 'Error consultando la auditoría.' });
  res.json(data);
});

// --- CRUD de categorías ------------------------------------------

rutasAdmin.get('/categorias', async (_req, res) => {
  const { data, error } = await supabase
    .from('categorias_publicas')
    .select('*')
    .order('orden');
  if (error) return res.status(500).json({ error: 'Error consultando categorías.' });
  res.json(data);
});

rutasAdmin.post('/categorias', async (req, res) => {
  const { nombre, color_hex, icono, orden } = req.body ?? {};
  const { data, error } = await supabase
    .from('categorias')
    .insert({
      nombre: String(nombre ?? '').trim(),
      color_hex: String(color_hex ?? '').trim(),
      icono: String(icono ?? 'default').trim() || 'default',
      orden: Number.isFinite(Number(orden)) ? Number(orden) : 100
    })
    .select()
    .single();
  if (error) {
    return res.status(400).json({
      error: 'No se pudo crear la categoría. Revisa que el nombre no exista y que el color sea #RRGGBB.'
    });
  }
  res.status(201).json(data);
});

rutasAdmin.patch('/categorias/:id', async (req, res) => {
  const b = req.body ?? {};
  const cambios = {};
  if (b.nombre !== undefined) cambios.nombre = String(b.nombre).trim();
  if (b.color_hex !== undefined) cambios.color_hex = String(b.color_hex).trim();
  if (b.icono !== undefined) cambios.icono = String(b.icono).trim() || 'default';
  if (b.orden !== undefined && Number.isFinite(Number(b.orden))) cambios.orden = Number(b.orden);

  const { error } = await supabase
    .from('categorias')
    .update(cambios)
    .eq('id', req.params.id);
  if (error) {
    return res.status(400).json({ error: 'No se pudo actualizar la categoría (¿color o nombre inválido?).' });
  }
  res.json({ ok: true });
});

rutasAdmin.delete('/categorias/:id', async (req, res) => {
  const { error } = await supabase
    .from('categorias')
    .delete()
    .eq('id', req.params.id);
  if (error) {
    // Casi siempre: violación de FK porque hay reportes usándola.
    return res.status(409).json({
      error: 'No se puede eliminar: hay reportes con esta categoría. Reasígnalos primero.'
    });
  }
  res.json({ ok: true });
});

// --- Exportación institucional completa --------------------------
// Incluye estado, canal, contacto y trazabilidad. NO es pública.

rutasAdmin.get('/export', async (req, res) => {
  const tabla = req.query.tabla === 'auditoria' ? 'auditoria' : 'reportes';
  const fecha = new Date().toISOString().slice(0, 10);

  if (tabla === 'auditoria') {
    const { data, error } = await supabase
      .from('auditoria_reportes')
      .select('*')
      .order('fecha_cambio');
    if (error) return res.status(500).json({ error: 'Error exportando auditoría.' });
    const csv = aCSV(data, [
      { campo: 'id', titulo: 'id' },
      { campo: 'reporte_id', titulo: 'reporte_id' },
      { campo: 'estado_anterior', titulo: 'estado_anterior' },
      { campo: 'estado_nuevo', titulo: 'estado_nuevo' },
      { campo: 'usuario_admin', titulo: 'usuario_admin' },
      { campo: 'fecha_cambio', titulo: 'fecha_cambio' },
      { campo: 'nota', titulo: 'nota' }
    ]);
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="ojam-auditoria-${fecha}.csv"`);
    return res.send(csv);
  }

  const { data, error } = await supabase
    .from('reportes_admin')
    .select('*')
    .order('creado_en');
  if (error) return res.status(500).json({ error: 'Error exportando reportes.' });

  const formato = req.query.formato === 'geojson' ? 'geojson' : 'csv';
  if (formato === 'geojson') {
    res.set('Content-Type', 'application/geo+json');
    res.set('Content-Disposition', `attachment; filename="ojam-completo-${fecha}.geojson"`);
    return res.json(aGeoJSON(data, ({ lon, lat, ...resto }) => resto));
  }

  const csv = aCSV(data, [
    { campo: 'id', titulo: 'id' },
    { campo: 'nombre_problematica', titulo: 'nombre_problematica' },
    { campo: 'municipio', titulo: 'municipio' },
    { campo: 'lat', titulo: 'latitud' },
    { campo: 'lon', titulo: 'longitud' },
    { campo: 'categoria', titulo: 'tipo_injusticia' },
    { campo: 'fecha_ocurrencia', titulo: 'fecha_ocurrencia' },
    { campo: 'actores_involucrados', titulo: 'actores_involucrados' },
    { campo: 'descripcion', titulo: 'descripcion' },
    { campo: 'es_anonimo', titulo: 'es_anonimo' },
    { campo: 'contacto_reportante', titulo: 'contacto_reportante' },
    { campo: 'canal_origen', titulo: 'canal_origen' },
    { campo: 'estado', titulo: 'estado' },
    { campo: 'creado_en', titulo: 'creado_en' },
    { campo: 'revisado_por', titulo: 'revisado_por' },
    { campo: 'revisado_en', titulo: 'revisado_en' }
  ]);
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="ojam-completo-${fecha}.csv"`);
  res.send(csv);
});
