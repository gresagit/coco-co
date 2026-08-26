-- ============================================================================
-- MIGRACIÓN 013 — Costo por unidad calculado a partir del costo total pagado
-- ============================================================================
-- Corre este script en Supabase DESPUÉS de migration_012_ventas_carrito.sql
--
-- Antes, al agregar entradas de insumo se capturaba directamente un "costo
-- unitario" a mano. Ahora se captura lo que realmente se ve en la factura/
-- ticket de compra — qué compraste, cuánto de eso, y cuánto pagaste en
-- total — y el sistema calcula el costo por unidad (kg, L, pieza, etc.):
--   costo_unitario = costo_total / cantidad
-- Ej.: 100 kg por $200 => $20.00 por kg.
--
-- Estas columnas guardan ese costo total y el costo por unidad ya calculado,
-- para cada entrada de insumo (con o sin lote/caducidad), para trazabilidad.

alter table movimientos
  add column if not exists costo_total numeric(14,2),
  add column if not exists costo_unitario numeric(12,4);

alter table insumo_lotes
  add column if not exists costo_total numeric(14,2),
  add column if not exists costo_unitario numeric(12,4);
