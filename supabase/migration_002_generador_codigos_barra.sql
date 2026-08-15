-- ============================================================================
-- MIGRACIÓN 002 — Generador de Códigos de Barra independiente
-- ============================================================================
-- Corre este script en Supabase > SQL Editor DESPUÉS de schema.sql.
-- Permite generar folios/códigos de barra de un producto:
--   - antes de que exista producción física (pre-impresión),
--   - asociados a un lote ya existente,
--   - o creando un lote nuevo "manual" (sin orden de producción formal).
-- No afecta ni modifica el inventario (producto_stock) — solo genera folios
-- de pieza para imprimir. El módulo de Producción sigue funcionando igual.
-- ============================================================================

-- 1. Relaja las relaciones obligatorias que impedían generar piezas/lotes
--    sin pasar por una orden de producción.
alter table lotes alter column orden_produccion_id drop not null;
alter table piezas alter column lote_id drop not null;

-- 2. Tabla que agrupa cada "tanda" de impresión de códigos de barra,
--    para poder generar el PDF de esa tanda después.
create table if not exists generaciones_codigo_barra (
  id uuid primary key default uuid_generate_v4(),
  producto_id uuid not null references productos(id),
  sucursal_id uuid not null references sucursales(id),
  lote_id uuid references lotes(id),
  cantidad integer not null,
  porcentaje_repuesto numeric(5,2) not null default 5,
  generado_por uuid references usuarios(id),
  created_at timestamptz not null default now()
);

-- 3. Vincula cada pieza generada a su tanda de impresión (para armar el PDF).
alter table piezas add column if not exists generacion_id uuid references generaciones_codigo_barra(id);

create index if not exists idx_piezas_generacion on piezas (generacion_id);
