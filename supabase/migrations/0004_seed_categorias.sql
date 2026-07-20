-- ============================================================
-- OJAM — 0004: Semilla de categorías (plantilla, sin datos reales)
--
-- Dos categorías de EJEMPLO para que el mapa y el formulario
-- funcionen desde el primer despliegue. Esta tabla está pensada
-- para CRECER: el panel de administración permite crear, editar
-- y recolorear categorías sin tocar código ni migraciones.
-- ============================================================

insert into public.categorias (nombre, color_hex, icono, orden) values
  ('Minería ilegal',        '#B45309', 'mineria', 10),
  ('Contaminación hídrica', '#0E7490', 'agua',    20);
