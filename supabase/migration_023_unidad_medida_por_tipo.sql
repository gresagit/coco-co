-- MIGRACIÓN 023 — las fórmulas (BOM) están capturadas en kilos, así que un
-- insumo de tipo "Materia Prima" o "Producto Intermedio" solo debe poder
-- registrarse en kg, g, o pz (para los que en realidad se cuentan por pieza,
-- ej. jabón pre-pastillado, y no por peso). "Empaque" y "Etiqueta" no entran
-- en el cálculo de fórmula por peso y conservan el catálogo completo
-- (kg, g, L, ml, pz, m).
--
-- Antes de agregar el constraint, se corrigen filas existentes que hoy
-- tengan una unidad fuera de familia para su tipo (ej. Materia Prima en L),
-- llevándolas a "kg" como valor seguro por default. Si tu catálogo real no
-- tiene ninguna fila así, este UPDATE no afecta nada.
update insumos
set unidad_medida = 'kg'
where tipo in ('Materia Prima', 'Producto Intermedio')
  and unidad_medida not in ('kg', 'g', 'pz');

alter table insumos
  drop constraint if exists insumos_unidad_medida_por_tipo_check;

alter table insumos
  add constraint insumos_unidad_medida_por_tipo_check
  check (
    tipo not in ('Materia Prima', 'Producto Intermedio')
    or unidad_medida in ('kg', 'g', 'pz')
  );
