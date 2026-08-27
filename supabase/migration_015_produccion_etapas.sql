-- ============================================================================
-- MIGRACION 015 - Planeacion y separacion de producto intermedio/terminado
-- ============================================================================
-- Ejecutar despues de migration_014_folios_ventas.sql

alter table ordenes_produccion
  add column if not exists fecha_estimada date;

alter table productos
  add column if not exists tipo_producto text not null default 'vendible';

alter table productos
  drop constraint if exists productos_tipo_producto_check;

alter table productos
  add constraint productos_tipo_producto_check
  check (tipo_producto in ('vendible', 'intermedio'));

-- Los productos existentes se consideran vendibles para conservar su operacion actual.
