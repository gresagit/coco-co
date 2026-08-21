-- ============================================================================
-- MIGRACIÓN 007 — Sección "Ventas": stock conectado a Shopify + ventas de
-- punto de venta
-- ============================================================================
-- Corre este script en Supabase DESPUÉS de migration_006_bom_julio2026.sql

-- Config de la conexión a Shopify (una sola fila, id fijo 'default').
-- El access_token es un Admin API access token de una app custom de
-- Shopify (Settings → Apps → Develop apps), con permiso de lectura de
-- productos e inventario como mínimo.
create table if not exists shopify_config (
  id text primary key default 'default',
  dominio text,               -- ej. "mi-tienda.myshopify.com"
  access_token text,
  ultima_sincronizacion timestamptz,
  actualizado_en timestamptz not null default now()
);

-- Ventas registradas manualmente desde el punto de venta (Clip, terminal,
-- caja, etc.) mientras no hay una integración automática. Cada línea
-- descuenta stock del producto en la sucursal indicada.
create table if not exists ventas_pos (
  id uuid primary key default gen_random_uuid(),
  sucursal_id uuid not null references sucursales(id),
  producto_id uuid not null references productos(id),
  cantidad numeric(12,2) not null check (cantidad > 0),
  precio_unitario numeric(12,4) not null default 0,
  total numeric(12,2) not null default 0,
  medio_pago text,             -- Efectivo, Tarjeta, Transferencia, etc.
  folio_pos text,               -- folio/ticket del punto de venta, si aplica
  notas text,
  registrada_por uuid references usuarios(id),
  creado_en timestamptz not null default now()
);

create index if not exists idx_ventas_pos_sucursal on ventas_pos(sucursal_id);
create index if not exists idx_ventas_pos_producto on ventas_pos(producto_id);
create index if not exists idx_ventas_pos_creado_en on ventas_pos(creado_en desc);
