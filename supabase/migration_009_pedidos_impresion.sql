-- ============================================================================
-- MIGRACIÓN 009 — Pedidos de impresión con varios productos a la vez
-- ============================================================================
-- Corre este script en Supabase DESPUÉS de migration_008_quitar_repuesto.sql
--
-- Permite generar códigos de barra de VARIOS productos en una sola pasada,
-- cada uno con su propia cantidad, y descargarlos juntos (PDF de hoja carta
-- o formato para impresora térmica). Cada producto sigue teniendo su propia
-- fila en generaciones_codigo_barra (para trazabilidad y reemplazos por
-- producto) — "pedidos_impresion" solo los agrupa para la descarga conjunta.

create table if not exists pedidos_impresion (
  id uuid primary key default uuid_generate_v4(),
  sucursal_id uuid not null references sucursales(id),
  generado_por uuid references usuarios(id),
  created_at timestamptz not null default now()
);

alter table generaciones_codigo_barra add column if not exists pedido_id uuid references pedidos_impresion(id);

create index if not exists idx_generaciones_pedido on generaciones_codigo_barra(pedido_id);
