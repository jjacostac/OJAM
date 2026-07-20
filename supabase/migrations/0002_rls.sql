-- ============================================================
-- OJAM — 0002: Seguridad a nivel de base de datos (RLS + grants)
--
-- Principio: la protección de `contacto_reportante` y de los
-- reportes no aprobados vive AQUÍ, no en el frontend ni en el
-- backend. Aunque un endpoint quede mal filtrado, el rol público
-- no puede leer esas columnas: no existen en lo que tiene acceso.
--
-- Modelo de acceso:
--   anon / authenticated  → SOLO las vistas públicas (lectura) y
--                            la RPC crear_reporte.
--   service_role (backend) → acceso completo (bypassa RLS). La key
--                            jamás sale del servidor.
-- ============================================================

-- RLS activado en todas las tablas. Sin políticas para anon ni
-- authenticated: el acceso directo a las tablas queda denegado.
alter table public.reportes            enable row level security;
alter table public.categorias          enable row level security;
alter table public.auditoria_reportes  enable row level security;

-- Retirar los grants por defecto de Supabase sobre las tablas base.
revoke all on table public.reportes           from anon, authenticated;
revoke all on table public.categorias         from anon, authenticated;
revoke all on table public.auditoria_reportes from anon, authenticated;

-- Lo ÚNICO legible por el público: las vistas sanitizadas.
grant select on public.reportes_publicos   to anon, authenticated;
grant select on public.categorias_publicas to anon, authenticated;

-- La vista admin solo la consume el backend (service_role).
revoke all on table public.reportes_admin from anon, authenticated;

-- RPCs: por defecto Postgres da EXECUTE a public; se restringe.
revoke execute on function public.crear_reporte(text, text, double precision, double precision, text, date, text, uuid, boolean, text, public.canal_origen) from public, anon, authenticated;
revoke execute on function public.admin_cambiar_estado(uuid, public.estado_reporte, uuid, text) from public, anon, authenticated;
revoke execute on function public.admin_mover_reporte(uuid, double precision, double precision) from public, anon, authenticated;

-- El alta de reportes entra por el backend (service_role), que
-- aplica rate-limiting. Si algún día se quisiera permitir el alta
-- directa desde el navegador sin backend, bastaría con:
--   grant execute on function public.crear_reporte(...) to anon;

-- Historial de auditoría inmutable también por grants (además del
-- trigger de 0003): nadie actualiza ni borra registros de auditoría.
revoke update, delete on table public.auditoria_reportes from service_role;
