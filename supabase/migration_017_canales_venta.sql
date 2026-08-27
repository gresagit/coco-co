-- ============================================================================
-- MIGRACION 017 - Configuracion de canales de venta
-- ============================================================================
-- Ejecutar despues de migration_016_permisos_usuarios.sql

create table if not exists canales_venta_config (
  id uuid primary key default uuid_generate_v4(),
  canal text not null check (canal in ('mercadolibre', 'amazon')),
  nombre text not null,
  activo boolean not null default true,
  credenciales jsonb not null default '{}'::jsonb,
  ultima_sincronizacion timestamptz,
  created_at timestamptz not null default now(),
  unique (canal, nombre)
);

create table if not exists canales_venta_productos (
  id uuid primary key default uuid_generate_v4(),
  canal_config_id uuid not null references canales_venta_config(id) on delete cascade,
  producto_id uuid not null references productos(id) on delete cascade,
  identificador_externo text not null,
  activo boolean not null default true,
  unique (canal_config_id, producto_id),
  unique (canal_config_id, identificador_externo)
);

create index if not exists idx_canales_venta_productos_config
  on canales_venta_productos(canal_config_id);
