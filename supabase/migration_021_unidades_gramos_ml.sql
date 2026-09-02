-- MIGRACIÓN 021 — permite usar gramos (g) y mililitros (ml) como unidad de
-- medida de un insumo, además de kg, L, pz y m. Esto afecta directamente la
-- unidad que se usa al capturar cantidades en las fórmulas (BOM), ya que la
-- unidad de cada línea de la fórmula se toma del insumo seleccionado.

alter table insumos
  drop constraint if exists insumos_unidad_medida_check;

alter table insumos
  add constraint insumos_unidad_medida_check
  check (unidad_medida in ('kg', 'g', 'L', 'ml', 'pz', 'm'));
