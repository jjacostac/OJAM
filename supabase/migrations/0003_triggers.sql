-- ============================================================
-- OJAM — 0003: Trazabilidad automática
--
-- La auditoría se escribe por TRIGGER, no por código del backend:
-- ninguna ruta nueva puede "olvidar" registrarla. El historial es
-- append-only (los triggers aplican incluso a service_role).
-- ============================================================

-- Toda creación de reporte y todo cambio de estado deja rastro.
create function public.fn_auditar_reporte()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.auditoria_reportes
      (reporte_id, estado_anterior, estado_nuevo, usuario_admin, nota)
    values
      (new.id, null, new.estado, null,
       'Alta por canal ' || new.canal_origen::text);
  elsif tg_op = 'UPDATE' and new.estado is distinct from old.estado then
    insert into public.auditoria_reportes
      (reporte_id, estado_anterior, estado_nuevo, usuario_admin, nota)
    values
      (new.id, old.estado, new.estado, new.revisado_por,
       nullif(current_setting('ojam.nota_auditoria', true), ''));
  end if;
  return new;
end;
$$;

create trigger trg_auditar_reporte
  after insert or update of estado on public.reportes
  for each row execute function public.fn_auditar_reporte();

-- Candado de inmutabilidad del historial.
create function public.fn_auditoria_inmutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'auditoria_reportes es append-only: no se permite % ', tg_op;
end;
$$;

create trigger trg_auditoria_inmutable
  before update or delete on public.auditoria_reportes
  for each row execute function public.fn_auditoria_inmutable();

-- Cinturón extra al del CHECK de 0001: si algo marca un reporte
-- como anónimo, el contacto se borra en vez de fallar la escritura.
create function public.fn_normalizar_anonimato()
returns trigger
language plpgsql
as $$
begin
  if new.es_anonimo then
    new.contacto_reportante := null;
  end if;
  return new;
end;
$$;

create trigger trg_normalizar_anonimato
  before insert or update on public.reportes
  for each row execute function public.fn_normalizar_anonimato();
