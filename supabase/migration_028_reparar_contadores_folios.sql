-- ============================================================================
-- MIGRACIÓN 028 — Reparar contadores después de eliminar tandas incorrectas
-- ============================================================================
-- Ejecuta esto DESPUÉS de eliminar desde el historial la tanda que comenzó
-- en 0201. El siguiente folio se calcula con las piezas que sí permanecen.
-- Si no queda ninguna pieza del producto, volverá a empezar en 0000.
-- ============================================================================

update folio_contadores fc
set ultimo_numero = coalesce(
  (
    select max(substring(pz.folio_pieza from '(\d+)$')::integer) + 1
    from piezas pz
    where pz.producto_id = fc.producto_id
  ),
  0
);
