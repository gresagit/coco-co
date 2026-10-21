-- Auditoria de solo lectura para validar catalogos e inventario.
-- Ejecutar en Supabase SQL Editor. Todas las instrucciones son SELECT:
-- no insertan, actualizan ni borran datos.
--
-- Ejecuta el archivo completo y comparte los resultados de cada bloque.
-- Los primeros dos bloques muestran las cantidades actuales; busca ahi el
-- registro que aparece con 707 y conserva su nombre, codigo, sucursal e ID.

-- 1. Existencias actuales de insumos, con estado del catalogo y minimo.
select
  s.id as stock_row_id,
  i.id as insumo_id,
  i.codigo_interno,
  i.nombre as insumo,
  i.tipo,
  i.unidad_medida,
  i.activo as insumo_activo,
  b.id as sucursal_id,
  b.nombre as sucursal,
  s.cantidad_disponible,
  s.stock_minimo
from public.insumo_stock s
left join public.insumos i on i.id = s.insumo_id
left join public.sucursales b on b.id = s.sucursal_id
order by s.cantidad_disponible desc nulls last, i.nombre, b.nombre;

-- 2. Existencias actuales de producto terminado.
select
  s.id as stock_row_id,
  p.id as producto_id,
  p.sku,
  p.nombre as producto,
  p.activo as producto_activo,
  b.id as sucursal_id,
  b.nombre as sucursal,
  s.cantidad_disponible,
  s.stock_minimo
from public.producto_stock s
left join public.productos p on p.id = s.producto_id
left join public.sucursales b on b.id = s.sucursal_id
order by s.cantidad_disponible desc nulls last, p.nombre, b.nombre;

-- 3. Duplicados de existencias por insumo y sucursal.
-- Si aparece mas de una fila para la misma pareja, la suma puede inflar el
-- stock mostrado por codigo que consolida filas duplicadas.
select
  insumo_id,
  sucursal_id,
  count(*) as filas,
  sum(cantidad_disponible) as cantidad_sumada,
  max(stock_minimo) as stock_minimo_mayor,
  array_agg(id order by id) as stock_row_ids
from public.insumo_stock
group by insumo_id, sucursal_id
having count(*) > 1
order by cantidad_sumada desc;

-- 4. Duplicados de existencias por producto y sucursal.
select
  producto_id,
  sucursal_id,
  count(*) as filas,
  sum(cantidad_disponible) as cantidad_sumada,
  max(stock_minimo) as stock_minimo_mayor,
  array_agg(id order by id) as stock_row_ids
from public.producto_stock
group by producto_id, sucursal_id
having count(*) > 1
order by cantidad_sumada desc;

-- 5. Existencias que apuntan a un insumo, producto o sucursal inexistente.
select
  'insumo_stock' as tabla,
  s.id as fila_id,
  s.insumo_id as entidad_id,
  s.sucursal_id,
  s.cantidad_disponible
from public.insumo_stock s
left join public.insumos i on i.id = s.insumo_id
left join public.sucursales b on b.id = s.sucursal_id
where i.id is null or b.id is null
union all
select
  'producto_stock' as tabla,
  s.id as fila_id,
  s.producto_id as entidad_id,
  s.sucursal_id,
  s.cantidad_disponible
from public.producto_stock s
left join public.productos p on p.id = s.producto_id
left join public.sucursales b on b.id = s.sucursal_id
where p.id is null or b.id is null
order by tabla, fila_id;

-- 6. Cantidades negativas en inventario.
select
  'insumo' as tipo,
  s.id as stock_row_id,
  i.codigo_interno as codigo,
  i.nombre as articulo,
  b.nombre as sucursal,
  s.cantidad_disponible
from public.insumo_stock s
left join public.insumos i on i.id = s.insumo_id
left join public.sucursales b on b.id = s.sucursal_id
where s.cantidad_disponible < 0
union all
select
  'producto' as tipo,
  s.id as stock_row_id,
  p.sku as codigo,
  p.nombre as articulo,
  b.nombre as sucursal,
  s.cantidad_disponible
from public.producto_stock s
left join public.productos p on p.id = s.producto_id
left join public.sucursales b on b.id = s.sucursal_id
where s.cantidad_disponible < 0
order by tipo, articulo, sucursal;

-- 7. Codigos internos duplicados de insumos (ignorando mayusculas/espacios).
select
  lower(trim(codigo_interno)) as codigo_normalizado,
  count(*) as filas,
  array_agg(id::text || ' | ' || nombre || ' | ' || tipo order by nombre) as registros
from public.insumos
where nullif(trim(codigo_interno), '') is not null
group by lower(trim(codigo_interno))
having count(*) > 1
order by codigo_normalizado;

-- 8. Nombres duplicados de insumos del mismo tipo (ignorando mayusculas y
-- espacios exteriores; no fusiona ni modifica variantes de nombre).
select
  lower(trim(nombre)) as nombre_normalizado,
  tipo,
  count(*) as filas,
  array_agg(id::text || ' | ' || codigo_interno || ' | ' || nombre order by codigo_interno) as registros
from public.insumos
group by lower(trim(nombre)), tipo
having count(*) > 1
order by tipo, nombre_normalizado;

-- 9. SKU duplicados de productos.
select
  lower(trim(sku)) as sku_normalizado,
  count(*) as filas,
  array_agg(id::text || ' | ' || nombre || ' | activo=' || activo::text order by nombre) as registros
from public.productos
where nullif(trim(sku), '') is not null
group by lower(trim(sku))
having count(*) > 1
order by sku_normalizado;

-- 10. Nombres duplicados de productos (posibles variantes o registros repetidos).
select
  lower(trim(nombre)) as nombre_normalizado,
  count(*) as filas,
  array_agg(id::text || ' | ' || sku || ' | ' || nombre || ' | activo=' || activo::text order by sku) as registros
from public.productos
group by lower(trim(nombre))
having count(*) > 1
order by nombre_normalizado;

-- 11. Catalogo completo de insumos, incluidos inactivos.
select
  id,
  codigo_interno,
  nombre,
  tipo,
  unidad_medida,
  activo,
  controla_caducidad
from public.insumos
order by activo desc, tipo, nombre;

-- 12. Catalogo completo de productos, incluidos inactivos.
select
  id,
  sku,
  nombre,
  activo
from public.productos
order by activo desc, nombre, sku;

-- 13. Articulos activos sin fila de stock en alguna sucursal activa.
select
  'insumo' as tipo,
  i.id as articulo_id,
  i.codigo_interno as codigo,
  i.nombre as articulo,
  b.id as sucursal_id,
  b.nombre as sucursal
from public.insumos i
cross join public.sucursales b
where i.activo = true
  and b.activa = true
  and not exists (
    select 1 from public.insumo_stock s
    where s.insumo_id = i.id and s.sucursal_id = b.id
  )
union all
select
  'producto' as tipo,
  p.id as articulo_id,
  p.sku as codigo,
  p.nombre as articulo,
  b.id as sucursal_id,
  b.nombre as sucursal
from public.productos p
cross join public.sucursales b
where p.activo = true
  and b.activa = true
  and not exists (
    select 1 from public.producto_stock s
    where s.producto_id = p.id and s.sucursal_id = b.id
  )
order by tipo, articulo, sucursal;

-- 14. Productos del catalogo y numero de componentes BOM ligados.
-- Un producto con cero componentes puede ser intencional, pero requiere validar
-- si efectivamente se fabrica con receta.
select
  p.id as producto_id,
  p.sku,
  p.nombre as producto,
  p.activo,
  count(b.producto_id) as componentes_bom
from public.productos p
left join public.bom b on b.producto_id = p.id
group by p.id, p.sku, p.nombre, p.activo
order by componentes_bom, p.nombre;

-- 15. Lineas de BOM con referencias inexistentes.
select
  b.producto_id,
  p.nombre as producto,
  b.insumo_id,
  i.nombre as insumo,
  b.cantidad_por_unidad,
  b.unidad
from public.bom b
left join public.productos p on p.id = b.producto_id
left join public.insumos i on i.id = b.insumo_id
where p.id is null or i.id is null
order by producto, insumo;

-- 16. Componentes repetidos dentro de la receta de un mismo producto.
select
  producto_id,
  insumo_id,
  unidad,
  count(*) as filas,
  sum(cantidad_por_unidad) as cantidad_sumada,
  array_agg(cantidad_por_unidad order by cantidad_por_unidad) as cantidades
from public.bom
group by producto_id, insumo_id, unidad
having count(*) > 1
order by producto_id, insumo_id;

-- 17. Insumos con caducidad: compara el stock disponible con la suma de lotes.
-- Una diferencia necesita contexto si se cargaron existencias iniciales sin lote.
with lotes as (
  select insumo_id, sucursal_id, sum(cantidad_restante) as cantidad_en_lotes
  from public.insumo_lotes
  group by insumo_id, sucursal_id
)
select
  i.id as insumo_id,
  i.codigo_interno,
  i.nombre as insumo,
  i.unidad_medida,
  b.nombre as sucursal,
  s.cantidad_disponible,
  coalesce(l.cantidad_en_lotes, 0) as cantidad_en_lotes,
  s.cantidad_disponible - coalesce(l.cantidad_en_lotes, 0) as diferencia
from public.insumo_stock s
join public.insumos i on i.id = s.insumo_id and i.controla_caducidad = true
left join public.sucursales b on b.id = s.sucursal_id
left join lotes l on l.insumo_id = s.insumo_id and l.sucursal_id = s.sucursal_id
where abs(s.cantidad_disponible - coalesce(l.cantidad_en_lotes, 0)) > 0.00001
order by abs(s.cantidad_disponible - coalesce(l.cantidad_en_lotes, 0)) desc;

-- 18. Movimientos con referencias faltantes o tipo de articulo cruzado.
select
  m.id as movimiento_id,
  m.fecha,
  m.tipo,
  m.origen_tipo,
  m.producto_id,
  p.nombre as producto,
  m.insumo_id,
  i.nombre as insumo,
  m.sucursal_id,
  b.nombre as sucursal
from public.movimientos m
left join public.productos p on p.id = m.producto_id
left join public.insumos i on i.id = m.insumo_id
left join public.sucursales b on b.id = m.sucursal_id
where (m.producto_id is not null and p.id is null)
   or (m.insumo_id is not null and i.id is null)
   or (m.sucursal_id is not null and b.id is null)
   or (m.origen_tipo = 'Producto' and (m.producto_id is null or m.insumo_id is not null))
   or (m.origen_tipo = 'Insumo' and (m.insumo_id is null or m.producto_id is not null))
order by m.fecha desc, m.id;

-- 19. Resumen del historial de movimientos, sin asumir que el saldo inicial
-- esta registrado como movimiento.
select
  tipo,
  origen_tipo,
  estado,
  count(*) as movimientos,
  sum(cantidad) as cantidad_total,
  min(fecha) as primer_movimiento,
  max(fecha) as ultimo_movimiento
from public.movimientos
group by tipo, origen_tipo, estado
order by tipo, origen_tipo, estado;

-- 20. Transferencias que siguen en transito.
select
  m.id as movimiento_id,
  m.fecha,
  m.origen_tipo,
  m.producto_id,
  p.nombre as producto,
  m.insumo_id,
  i.nombre as insumo,
  origen.nombre as sucursal_origen,
  destino.nombre as sucursal_destino,
  m.cantidad,
  m.estado
from public.movimientos m
left join public.productos p on p.id = m.producto_id
left join public.insumos i on i.id = m.insumo_id
left join public.sucursales origen on origen.id = m.sucursal_origen_id
left join public.sucursales destino on destino.id = m.sucursal_destino_id
where m.tipo = 'Transferencia' and m.estado = 'En tránsito'
order by m.fecha, m.id;

-- 21. Movimientos mas recientes para el articulo identificado en los bloques
-- 1 o 2. Revisa si el codigo/nombre corresponde y si la secuencia explica el
-- saldo. Comparte tambien el stock_row_id y los IDs del articulo/sucursal.
select
  m.id as movimiento_id,
  m.fecha,
  m.tipo,
  m.origen_tipo,
  m.producto_id,
  p.sku,
  p.nombre as producto,
  m.insumo_id,
  i.codigo_interno,
  i.nombre as insumo,
  m.sucursal_id,
  actual.nombre as sucursal,
  m.sucursal_origen_id,
  origen.nombre as sucursal_origen,
  m.sucursal_destino_id,
  destino.nombre as sucursal_destino,
  m.cantidad,
  m.estado,
  m.referencia,
  m.notas
from public.movimientos m
left join public.productos p on p.id = m.producto_id
left join public.insumos i on i.id = m.insumo_id
left join public.sucursales actual on actual.id = m.sucursal_id
left join public.sucursales origen on origen.id = m.sucursal_origen_id
left join public.sucursales destino on destino.id = m.sucursal_destino_id
order by m.fecha desc, m.id desc
limit 300;

-- 22. Diagnostico especifico del "Jabon para ropa normal 1kg" de la captura.
-- Devuelve una fila por registro en producto_stock, junto con SKU y sucursal.
select
  p.id as producto_id,
  p.sku,
  p.nombre as producto,
  p.activo as producto_activo,
  b.id as sucursal_id,
  b.nombre as sucursal,
  s.id as stock_row_id,
  s.cantidad_disponible,
  s.stock_minimo
from public.productos p
left join public.producto_stock s on s.producto_id = p.id
left join public.sucursales b on b.id = s.sucursal_id
where p.nombre ilike '%ropa%normal%1kg%'
order by p.nombre, p.sku, b.nombre, s.id;

-- 23. Folios/piezas del producto: compara el numero registrado por estado
-- contra el saldo de producto_stock. Piezas iniciales no necesariamente
-- existen para inventario que se cargo manualmente.
select
  p.id as producto_id,
  p.sku,
  p.nombre as producto,
  x.sucursal_id,
  b.nombre as sucursal,
  x.estado,
  count(*) as piezas
from public.piezas x
join public.productos p on p.id = x.producto_id
left join public.sucursales b on b.id = x.sucursal_id
where p.nombre ilike '%ropa%normal%1kg%'
group by p.id, p.sku, p.nombre, x.sucursal_id, b.nombre, x.estado
order by p.nombre, b.nombre, x.estado;

-- 24. Movimientos de inventario del producto de la captura. Los ajustes
-- registran diferencia absoluta en cantidad y no guardan aqui su signo; por
-- eso se muestran como Ajuste y no se suman como entradas/salidas.
select
  m.id as movimiento_id,
  m.fecha,
  m.tipo,
  m.estado,
  m.sucursal_id,
  b.nombre as sucursal,
  m.cantidad,
  m.referencia,
  m.notas
from public.movimientos m
join public.productos p on p.id = m.producto_id
left join public.sucursales b on b.id = m.sucursal_id
where p.nombre ilike '%ropa%normal%1kg%'
order by m.fecha desc, m.id desc
limit 500;

git add src/app/dashboard/page.tsx \
        src/app/dashboard/alertas/page.tsx \
        supabase/auditoria_integridad_inventario.sql

git commit -m "Corrige semaforos y agrega auditoria de inventario" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"

git push origin HEAD