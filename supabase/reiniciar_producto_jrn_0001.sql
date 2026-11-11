-- Reinicio destructivo del SKU JRN-0001.
-- Conserva la ficha del producto, su BOM, el stock minimo y los pedidos
-- online que tambien contengan otros productos.
-- Elimina piezas/codigos, reimpresiones, produccion, ventas POS, movimientos,
-- renglones online de este producto y pedidos online que queden vacios.
-- Conserva auditoria y no repone insumos consumidos en producciones anteriores.
-- Los nuevos folios usaran el prefijo exclusivo JRN-0001 y comenzaran en
-- JRN-0001-0001, para no compartir la secuencia del SKU JRN-0002.
--
-- Hacer un respaldo antes de continuar.
-- 1) Ejecutar primero la previsualizacion por separado.
-- 2) Verificar el SKU, sucursales y conteos afectados.
-- 3) Ejecutar el bloque transaccional. Verifica sus resultados antes del
--    ROLLBACK final. Cambiar ROLLBACK por COMMIT solo si se desea aplicar.

-- PREVISUALIZACION (ejecutar por separado; solo lectura).
WITH producto AS (
  SELECT id
  FROM public.productos
  WHERE sku = 'JRN-0001'
),
lotes_producto AS (
  SELECT id
  FROM public.lotes
  WHERE producto_id IN (SELECT id FROM producto)
),
ordenes_producto AS (
  SELECT id
  FROM public.ordenes_produccion
  WHERE producto_id IN (SELECT id FROM producto)
),
reportes_producto AS (
  SELECT ra.id
  FROM public.reportes_avance ra
  LEFT JOIN public.ordenes_produccion op ON op.id = ra.orden_produccion_id
  LEFT JOIN public.lotes l ON l.id = ra.lote_id
  WHERE op.producto_id IN (SELECT id FROM producto)
     OR l.producto_id IN (SELECT id FROM producto)
),
piezas_producto AS (
  SELECT id
  FROM public.piezas
  WHERE producto_id IN (SELECT id FROM producto)
),
pedidos_producto AS (
  SELECT DISTINCT pedido_id
  FROM public.pedido_tienda_items
  WHERE producto_id IN (SELECT id FROM producto)
)
SELECT 'producto encontrado' AS registro, count(*) AS cantidad
FROM producto
UNION ALL
SELECT 'piezas/codigos', count(*) FROM piezas_producto
UNION ALL
SELECT 'reimpresiones de etiquetas', count(*)
FROM public.reimpresiones_etiqueta
WHERE pieza_id IN (SELECT id FROM piezas_producto)
UNION ALL
SELECT 'consumos de insumos de su produccion', count(*)
FROM public.reporte_consumo_insumos
WHERE pieza_id IN (SELECT id FROM piezas_producto)
   OR reporte_avance_id IN (SELECT id FROM reportes_producto)
UNION ALL
SELECT 'reportes de avance', count(*) FROM reportes_producto
UNION ALL
SELECT 'generaciones de codigos', count(*)
FROM public.generaciones_codigo_barra
WHERE producto_id IN (SELECT id FROM producto)
UNION ALL
SELECT 'metas de produccion', count(*)
FROM public.metas_produccion
WHERE producto_id IN (SELECT id FROM producto)
UNION ALL
SELECT 'lotes', count(*) FROM lotes_producto
UNION ALL
SELECT 'ordenes de produccion', count(*) FROM ordenes_producto
UNION ALL
SELECT 'ventas POS', count(*)
FROM public.ventas_pos
WHERE producto_id IN (SELECT id FROM producto)
UNION ALL
SELECT 'movimientos', count(*)
FROM public.movimientos
WHERE producto_id IN (SELECT id FROM producto)
UNION ALL
SELECT 'renglones de pedidos online del producto', count(*)
FROM public.pedido_tienda_items
WHERE producto_id IN (SELECT id FROM producto)
UNION ALL
SELECT 'pedidos online afectados (pueden incluir otros productos)', count(*)
FROM pedidos_producto
UNION ALL
SELECT 'filas de stock', count(*)
FROM public.producto_stock
WHERE producto_id IN (SELECT id FROM producto);

-- Identidad del producto y stock que se pondra en cero por sucursal.
SELECT
  p.id AS producto_id,
  p.sku,
  p.nombre,
  s.nombre AS sucursal,
  ps.cantidad_disponible,
  ps.stock_minimo
FROM public.productos p
LEFT JOIN public.producto_stock ps ON ps.producto_id = p.id
LEFT JOIN public.sucursales s ON s.id = ps.sucursal_id
WHERE p.sku = 'JRN-0001'
ORDER BY s.nombre;

-- Los pedidos con otros productos se conservaran; se borrara solo el renglon
-- de JRN-0001. Un pedido que quede sin renglones se eliminara.
SELECT
  pt.id AS pedido_id,
  pt.pedido_externo_id,
  pt.estado,
  count(*) FILTER (WHERE pti.producto_id <> p.id) AS renglones_de_otros_productos
FROM public.productos p
JOIN public.pedido_tienda_items objetivo ON objetivo.producto_id = p.id
JOIN public.pedidos_tienda pt ON pt.id = objetivo.pedido_id
LEFT JOIN public.pedido_tienda_items pti ON pti.pedido_id = pt.id
WHERE p.sku = 'JRN-0001'
GROUP BY pt.id, pt.pedido_externo_id, pt.estado
ORDER BY pt.pedido_externo_id;

-- Muestra las claves foraneas que apuntan a entidades que se van a borrar.
-- El bloque transaccional abortara y se podra revertir si queda alguna
-- dependencia no contemplada.
SELECT
  conrelid::regclass AS tabla_dependiente,
  conname AS restriccion,
  confrelid::regclass AS tabla_referenciada,
  pg_get_constraintdef(oid) AS definicion
FROM pg_constraint
WHERE contype = 'f'
  AND confrelid IN (
    to_regclass('public.piezas'),
    to_regclass('public.reimpresiones_etiqueta'),
    to_regclass('public.reporte_consumo_insumos'),
    to_regclass('public.reportes_avance'),
    to_regclass('public.generaciones_codigo_barra'),
    to_regclass('public.metas_produccion'),
    to_regclass('public.lotes'),
    to_regclass('public.ordenes_produccion'),
    to_regclass('public.ventas_pos'),
    to_regclass('public.pedido_tienda_items'),
    to_regclass('public.pedidos_tienda')
  )
ORDER BY 3, 1, 2;

BEGIN;

DO $$
DECLARE
  v_producto_id uuid;
  v_productos integer;
  v_count integer;
  v_pedidos_ids uuid[];
BEGIN
  SELECT count(*)
  INTO v_productos
  FROM public.productos
  WHERE sku = 'JRN-0001';

  IF v_productos <> 1 THEN
    RAISE EXCEPTION
      'Se esperaba un producto con SKU JRN-0001; encontrados: %',
      v_productos;
  END IF;

  SELECT id
  INTO v_producto_id
  FROM public.productos
  WHERE sku = 'JRN-0001'
  FOR UPDATE;

  IF EXISTS (
    SELECT 1
    FROM public.piezas
    WHERE producto_id <> v_producto_id
      AND folio_pieza LIKE 'JRN-0001-%'
  ) THEN
    RAISE EXCEPTION
      'Ya existen folios JRN-0001-* de otro producto; no se puede reiniciar esta secuencia sin riesgo de colision.';
  END IF;

  DELETE FROM public.reimpresiones_etiqueta
  WHERE pieza_id IN (
    SELECT id FROM public.piezas WHERE producto_id = v_producto_id
  );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'Reimpresiones eliminadas: %', v_count;

  DELETE FROM public.reporte_consumo_insumos
  WHERE pieza_id IN (
    SELECT id FROM public.piezas WHERE producto_id = v_producto_id
  )
  OR reporte_avance_id IN (
    SELECT ra.id
    FROM public.reportes_avance ra
    LEFT JOIN public.ordenes_produccion op ON op.id = ra.orden_produccion_id
    LEFT JOIN public.lotes l ON l.id = ra.lote_id
    WHERE op.producto_id = v_producto_id OR l.producto_id = v_producto_id
  );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'Registros de consumo ligados a su produccion eliminados: %', v_count;

  DELETE FROM public.reportes_avance ra
  WHERE ra.orden_produccion_id IN (
    SELECT id FROM public.ordenes_produccion WHERE producto_id = v_producto_id
  )
  OR ra.lote_id IN (
    SELECT id FROM public.lotes WHERE producto_id = v_producto_id
  );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'Reportes de avance eliminados: %', v_count;

  DELETE FROM public.piezas
  WHERE producto_id = v_producto_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'Piezas/codigos eliminados: %', v_count;

  DELETE FROM public.generaciones_codigo_barra
  WHERE producto_id = v_producto_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'Generaciones de codigos eliminadas: %', v_count;

  DELETE FROM public.metas_produccion
  WHERE producto_id = v_producto_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'Metas de produccion eliminadas: %', v_count;

  DELETE FROM public.lotes
  WHERE producto_id = v_producto_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'Lotes eliminados: %', v_count;

  DELETE FROM public.ordenes_produccion
  WHERE producto_id = v_producto_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'Ordenes de produccion eliminadas: %', v_count;

  DELETE FROM public.ventas_pos
  WHERE producto_id = v_producto_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'Ventas POS eliminadas: %', v_count;

  DELETE FROM public.movimientos
  WHERE producto_id = v_producto_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'Movimientos del producto eliminados: %', v_count;

  SELECT array_agg(DISTINCT pedido_id)
  INTO v_pedidos_ids
  FROM public.pedido_tienda_items
  WHERE producto_id = v_producto_id;

  DELETE FROM public.pedido_tienda_items
  WHERE producto_id = v_producto_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'Renglones de pedidos online del producto eliminados: %', v_count;

  DELETE FROM public.pedidos_tienda pt
  WHERE pt.id = ANY(coalesce(v_pedidos_ids, ARRAY[]::uuid[]))
  AND NOT EXISTS (
    SELECT 1
    FROM public.pedido_tienda_items pti
    WHERE pti.pedido_id = pt.id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.ordenes_produccion op
    WHERE op.pedido_tienda_id = pt.id
  );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'Pedidos online vacios eliminados: %', v_count;

  UPDATE public.producto_stock
  SET cantidad_disponible = 0
  WHERE producto_id = v_producto_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'Filas de stock puestas en cero (minimos conservados): %', v_count;

  INSERT INTO public.folio_contadores (producto_id, prefijo, ultimo_numero)
  SELECT id, 'JRN-0001', 1
  FROM public.productos
  WHERE id = v_producto_id
  ON CONFLICT (producto_id) DO UPDATE
  SET prefijo = EXCLUDED.prefijo,
      ultimo_numero = 1;
  RAISE NOTICE 'Prefijo cambiado a JRN-0001; siguiente folio: JRN-0001-0001.';
END
$$;

-- Verificacion dentro de la transaccion. Se esperan ceros para historiales
-- eliminados y el stock/contador debe estar en cero. El producto debe existir.
SELECT
  p.sku,
  p.nombre,
  (SELECT count(*) FROM public.piezas x WHERE x.producto_id = p.id) AS piezas_restantes,
  (SELECT count(*) FROM public.generaciones_codigo_barra g WHERE g.producto_id = p.id) AS generaciones_restantes,
  (SELECT count(*) FROM public.metas_produccion m WHERE m.producto_id = p.id) AS metas_restantes,
  (SELECT count(*) FROM public.lotes l WHERE l.producto_id = p.id) AS lotes_restantes,
  (SELECT count(*) FROM public.ordenes_produccion op WHERE op.producto_id = p.id) AS ordenes_restantes,
  (SELECT count(*) FROM public.ventas_pos v WHERE v.producto_id = p.id) AS ventas_pos_restantes,
  (SELECT count(*) FROM public.movimientos m WHERE m.producto_id = p.id) AS movimientos_restantes,
  (SELECT count(*) FROM public.pedido_tienda_items pti WHERE pti.producto_id = p.id) AS items_online_restantes,
  (SELECT coalesce(sum(ps.cantidad_disponible), 0) FROM public.producto_stock ps WHERE ps.producto_id = p.id) AS stock_disponible,
  (SELECT count(*) FROM public.folio_contadores fc
    WHERE fc.producto_id = p.id
      AND fc.prefijo = 'JRN-0001'
      AND fc.ultimo_numero = 1) AS siguiente_folio_es_0001,
  (SELECT count(*) FROM public.bom b WHERE b.producto_id = p.id) AS componentes_bom_conservados
FROM public.productos p
WHERE p.sku = 'JRN-0001';

-- Deja ROLLBACK para la primera prueba.
-- Cambialo a COMMIT solo despues de revisar la previsualizacion y verificaciones.
ROLLBACK;
