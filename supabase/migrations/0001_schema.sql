-- ============================================================
-- OJAM — 0001: Esquema base
-- Postgres + PostGIS (Supabase). Sin datos reales: solo estructura.
-- ============================================================

-- PostGIS en el esquema `extensions` (convención de Supabase; ese
-- esquema está en el search_path por defecto, por lo que `geometry`
-- se puede usar sin calificar).
create extension if not exists postgis with schema extensions;

-- ------------------------------------------------------------
-- Enums de trazabilidad
-- ------------------------------------------------------------
create type public.canal_origen as enum ('web', 'whatsapp');
create type public.estado_reporte as enum ('pendiente', 'aprobado', 'rechazado');

-- ------------------------------------------------------------
-- categorias — "tipo de injusticia"
-- Tabla VIVA: pensada para crecer desde el panel admin (CRUD).
-- El formulario público puebla su desplegable desde aquí;
-- los colores del mapa salen de color_hex (nunca hardcodear).
-- ------------------------------------------------------------
create table public.categorias (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null unique,
  color_hex  text not null check (color_hex ~* '^#[0-9a-f]{6}$'),
  icono      text not null default 'default', -- nombre del ícono en frontend/assets/icons/categorias/
  orden      smallint not null default 100,
  creado_en  timestamptz not null default now()
);

-- ------------------------------------------------------------
-- reportes — un conflicto ambiental georreferenciado
-- ------------------------------------------------------------
create table public.reportes (
  id                   uuid primary key default gen_random_uuid(),
  nombre_problematica  text not null check (length(trim(nombre_problematica)) > 0),
  municipio            text not null,
  ubicacion            geometry(Point, 4326) not null,
  descripcion          text not null,
  fecha_ocurrencia     date,
  actores_involucrados text,
  categoria_id         uuid not null references public.categorias (id),
  es_anonimo           boolean not null default false,
  -- SENSIBLE: solo legible desde el panel admin. Nunca en la vista
  -- pública ni en la exportación abierta (ver 0002_rls.sql).
  contacto_reportante  text,
  canal_origen         public.canal_origen not null default 'web',
  estado               public.estado_reporte not null default 'pendiente',
  creado_en            timestamptz not null default now(),
  revisado_por         uuid references auth.users (id),
  revisado_en          timestamptz,

  -- Garantía en la base, no solo en la app: un reporte anónimo
  -- no puede tener contacto guardado bajo ninguna circunstancia.
  constraint anonimo_sin_contacto
    check (not es_anonimo or contacto_reportante is null),

  -- El punto debe caer en rangos de coordenadas válidos.
  constraint ubicacion_valida
    check (st_x(ubicacion) between -180 and 180
       and st_y(ubicacion) between -90 and 90)
);

create index reportes_ubicacion_gix on public.reportes using gist (ubicacion);
create index reportes_estado_idx    on public.reportes (estado);
create index reportes_categoria_idx on public.reportes (categoria_id);

-- ------------------------------------------------------------
-- auditoria_reportes — historial append-only de cambios de estado
-- ------------------------------------------------------------
create table public.auditoria_reportes (
  id              bigint generated always as identity primary key,
  reporte_id      uuid not null references public.reportes (id) on delete cascade,
  estado_anterior public.estado_reporte,          -- null = creación del reporte
  estado_nuevo    public.estado_reporte not null,
  usuario_admin   uuid references auth.users (id), -- null = alta por canal público
  fecha_cambio    timestamptz not null default now(),
  nota            text
);

create index auditoria_reporte_idx on public.auditoria_reportes (reporte_id, fecha_cambio);

-- ------------------------------------------------------------
-- Vistas de lectura
-- ------------------------------------------------------------

-- Vista PÚBLICA: lo único que el rol anónimo puede leer.
-- Excluye por diseño: contacto_reportante, es_anonimo, estado,
-- revisado_por, revisado_en y canal_origen. Solo casos aprobados.
create view public.reportes_publicos
  with (security_invoker = off) as
  select
    r.id,
    r.nombre_problematica,
    r.municipio,
    st_x(r.ubicacion) as lon,
    st_y(r.ubicacion) as lat,
    r.descripcion,
    r.fecha_ocurrencia,
    r.actores_involucrados,
    r.categoria_id,
    r.creado_en
  from public.reportes r
  where r.estado = 'aprobado';

-- Categorías con contador de casos aprobados (panel de categorías
-- del frontend: "Minería ilegal [19]").
create view public.categorias_publicas
  with (security_invoker = off) as
  select
    c.id,
    c.nombre,
    c.color_hex,
    c.icono,
    c.orden,
    count(r.id) filter (where r.estado = 'aprobado') as casos
  from public.categorias c
  left join public.reportes r on r.categoria_id = c.id
  group by c.id;

-- Vista ADMIN: todos los campos, con lon/lat ya extraídos para no
-- manipular geometría en el backend. Solo la usa la service role.
create view public.reportes_admin
  with (security_invoker = off) as
  select
    r.id,
    r.nombre_problematica,
    r.municipio,
    st_x(r.ubicacion) as lon,
    st_y(r.ubicacion) as lat,
    r.descripcion,
    r.fecha_ocurrencia,
    r.actores_involucrados,
    r.categoria_id,
    c.nombre as categoria,
    r.es_anonimo,
    r.contacto_reportante,
    r.canal_origen,
    r.estado,
    r.creado_en,
    r.revisado_por,
    r.revisado_en
  from public.reportes r
  join public.categorias c on c.id = r.categoria_id;

-- ------------------------------------------------------------
-- Funciones RPC (las llama el backend vía supabase-js)
-- ------------------------------------------------------------

-- Alta de un reporte (formulario web o transcripción de WhatsApp).
-- Normaliza el anonimato en la base: si es anónimo, el contacto se
-- descarta aquí, no solo en la interfaz.
create function public.crear_reporte(
  p_nombre     text,
  p_municipio  text,
  p_lon        double precision,
  p_lat        double precision,
  p_descripcion text,
  p_fecha      date,
  p_actores    text,
  p_categoria  uuid,
  p_es_anonimo boolean,
  p_contacto   text,
  p_canal      public.canal_origen
) returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_id uuid;
begin
  insert into public.reportes (
    nombre_problematica, municipio, ubicacion, descripcion,
    fecha_ocurrencia, actores_involucrados, categoria_id,
    es_anonimo, contacto_reportante, canal_origen
  ) values (
    p_nombre, p_municipio,
    st_setsrid(st_makepoint(p_lon, p_lat), 4326),
    p_descripcion, p_fecha, p_actores, p_categoria,
    p_es_anonimo,
    case when p_es_anonimo then null else nullif(trim(p_contacto), '') end,
    p_canal
  ) returning id into v_id;
  return v_id;
end;
$$;

-- Cambio de estado por un administrador. La nota viaja por una
-- variable de sesión que recoge el trigger de auditoría (0003).
create function public.admin_cambiar_estado(
  p_id     uuid,
  p_estado public.estado_reporte,
  p_admin  uuid,
  p_nota   text default null
) returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform set_config('ojam.nota_auditoria', coalesce(p_nota, ''), true);
  update public.reportes
     set estado = p_estado,
         revisado_por = p_admin,
         revisado_en = now()
   where id = p_id;
  if not found then
    raise exception 'Reporte % no existe', p_id;
  end if;
end;
$$;

-- Corrección de ubicación de un punto (mover el pin desde el admin).
create function public.admin_mover_reporte(
  p_id  uuid,
  p_lon double precision,
  p_lat double precision
) returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  update public.reportes
     set ubicacion = st_setsrid(st_makepoint(p_lon, p_lat), 4326)
   where id = p_id;
  if not found then
    raise exception 'Reporte % no existe', p_id;
  end if;
end;
$$;
