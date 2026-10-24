-- Ejecutar despues de migration_029_folios_en_lote.sql.
-- Las solicitudes publicas no tienen rol ni permisos hasta que un
-- administrador las aprueba.

create table if not exists solicitudes_acceso (
  id uuid primary key default uuid_generate_v4(),
  nombre_completo text not null,
  usuario text not null,
  password_hash text,
  estado text not null default 'Pendiente'
    check (estado in ('Pendiente', 'Aprobada', 'Rechazada')),
  created_at timestamptz not null default now(),
  revisado_por uuid references usuarios(id),
  revisado_en timestamptz,
  usuario_creado_id uuid references usuarios(id)
);

create unique index if not exists idx_solicitudes_acceso_usuario_pendiente
  on solicitudes_acceso (lower(usuario))
  where estado = 'Pendiente';

alter table solicitudes_acceso enable row level security;
revoke all on solicitudes_acceso from anon, authenticated;
grant all on solicitudes_acceso to service_role;

create or replace function aprobar_solicitud_acceso(
  p_solicitud_id uuid,
  p_rol_id uuid,
  p_sucursal_ids uuid[],
  p_revisado_por uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_solicitud solicitudes_acceso%rowtype;
  v_usuario_id uuid;
  v_sucursales_validas integer;
begin
  if not exists (
    select 1
    from usuario_roles ur
    join roles r on r.id = ur.rol_id
    where ur.usuario_id = p_revisado_por
      and r.nombre = 'Administrador'
  ) then
    raise exception 'Solo un administrador puede aprobar solicitudes.';
  end if;

  select *
  into v_solicitud
  from solicitudes_acceso
  where id = p_solicitud_id
    and estado = 'Pendiente'
  for update;

  if not found then
    raise exception 'La solicitud ya no está pendiente.';
  end if;

  if v_solicitud.password_hash is null then
    raise exception 'La solicitud no tiene una contraseña válida.';
  end if;

  if not exists (select 1 from roles where id = p_rol_id) then
    raise exception 'Selecciona un rol existente.';
  end if;

  if coalesce(cardinality(p_sucursal_ids), 0) = 0 then
    raise exception 'Selecciona al menos una sucursal.';
  end if;

  select count(distinct s.id)
  into v_sucursales_validas
  from sucursales s
  where s.id = any(p_sucursal_ids)
    and s.activa = true;

  if v_sucursales_validas <> (
    select count(distinct sucursal_id)
    from unnest(p_sucursal_ids) as seleccionadas(sucursal_id)
  ) then
    raise exception 'Una o más sucursales ya no están activas.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(lower(v_solicitud.usuario), 0));

  if exists (
    select 1 from usuarios
    where lower(usuario) = lower(v_solicitud.usuario)
  ) then
    raise exception 'Ya existe un usuario con ese nombre de acceso.';
  end if;

  insert into usuarios (
    usuario,
    nombre_completo,
    password_hash,
    activo,
    acceso_todas_sucursales,
    permisos
  )
  values (
    v_solicitud.usuario,
    v_solicitud.nombre_completo,
    v_solicitud.password_hash,
    true,
    false,
    '{}'::jsonb
  )
  returning id into v_usuario_id;

  insert into usuario_roles (usuario_id, rol_id)
  values (v_usuario_id, p_rol_id);

  insert into usuario_sucursales (usuario_id, sucursal_id)
  select v_usuario_id, sucursal_id
  from (select distinct unnest(p_sucursal_ids) as sucursal_id) seleccionadas;

  update solicitudes_acceso
  set estado = 'Aprobada',
      password_hash = null,
      revisado_por = p_revisado_por,
      revisado_en = now(),
      usuario_creado_id = v_usuario_id
  where id = p_solicitud_id;

  return v_usuario_id;
end;
$$;

revoke all on function aprobar_solicitud_acceso(uuid, uuid, uuid[], uuid) from public, anon, authenticated;
grant execute on function aprobar_solicitud_acceso(uuid, uuid, uuid[], uuid) to service_role;
