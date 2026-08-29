-- MIGRACIÓN 018 — Clientes y registro de clientes en ventas
-- Corre este script en Supabase después de la última migración activa.

create table if not exists clientes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  apellido text not null,
  telefono text not null,
  tipo_cliente text not null default 'ocasional' check (tipo_cliente in ('ocasional','mayorista')),
  nombre_empresa text,
  nombre_responsable text,
  telefono_responsable text,
  correo_responsable text,
  lugar_origen text,
  volumen_compra text,
  productos_interes text,
  created_at timestamptz not null default now(),
  unique (nombre, apellido, telefono)
);

create index if not exists idx_clientes_tipo on clientes(tipo_cliente);
create index if not exists idx_clientes_nombre on clientes(nombre, apellido);

alter table if exists ventas_pos
  add column if not exists cliente_id uuid references clientes(id),
  add column if not exists cliente_tipo text default 'ocasional' check (cliente_tipo in ('ocasional','mayorista')),
  add column if not exists cliente_nombre text,
  add column if not exists cliente_apellido text,
  add column if not exists cliente_telefono text,
  add column if not exists cliente_empresa text,
  add column if not exists cliente_responsable text,
  add column if not exists cliente_telefono_responsable text,
  add column if not exists cliente_correo_responsable text,
  add column if not exists cliente_lugar_origen text,
  add column if not exists cliente_volumen_compra text,
  add column if not exists cliente_productos_interes text;

create index if not exists idx_ventas_pos_cliente on ventas_pos(cliente_id);
