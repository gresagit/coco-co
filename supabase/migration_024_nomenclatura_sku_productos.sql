-- MIGRACIÓN 024 — renombra los SKU de producto terminado a la nueva
-- nomenclatura fija por línea de producto (ATB, ATC, ATM, LP, RLP, RAT,
-- PLM, RM, JRN, JPS, JTH, PM6), en vez del prefijo auto-derivado de las
-- primeras 3 letras del nombre de categoría (causa de colisiones, ej. dos
-- categorías que empiezan con "Jab...").
--
-- No usa tabla temporal a propósito: en el SQL Editor de Supabase, si
-- corres el script en fragmentos o vía el pooler en modo transacción, una
-- tabla temporal creada en un statement puede no existir ya para el
-- siguiente. Aquí cada UPDATE trae su propio mapeo en un VALUES, así que
-- puedes correr los statements en el orden que sea sin depender de sesión
-- compartida.
--
-- IMPORTANTE:
-- 1. Los códigos de barra YA IMPRESOS en físico seguirán mostrando el SKU
--    viejo — sólo los que generes de aquí en adelante usarán el nuevo.
-- 2. No reinicia folio_contadores.ultimo_numero — solo actualiza el
--    prefijo, para no perder continuidad de piezas producidas por producto.
-- 3. Cuando conectes Shopify, da de alta cada variante con el SKU YA NUEVO
--    (ver tabla de abajo) para que empate desde el primer sync.

-- 1) Actualiza el prefijo de folio_contadores ANTES de renombrar el SKU
--    (todavía se hace match por el sku viejo).
update folio_contadores fc
set prefijo = split_part(m.sku_nuevo, '-', 1)
from productos p
join (values
  ('LIM-0007', 'ATB-0001'),
  ('LIM-0001', 'ATB-0002'),
  ('LIM-0030', 'ATC-0001'),
  ('LIM-0003', 'ATC-0002'),
  ('LIM-0009', 'ATM-0001'),
  ('COC-0004', 'ATM-0002'),
  ('LIM-0006', 'LP-0001'),
  ('LIM-0005', 'RLP-0001'),
  ('LIM-0008', 'RAT-0001'),
  ('LIM-0061', 'PLM-0001'),
  ('VES-0003', 'RM-0001'),
  ('VES-0001', 'JRN-0001'),
  ('PRO-0001', 'JRN-0002'),
  ('COR-0001', 'JPS-0001'),
  ('PRO-0003', 'JPS-0002'),
  ('COC-0005', 'JTH-0001'),
  ('COC-0001', 'PM6-0001')
) as m(sku_actual, sku_nuevo) on m.sku_actual = p.sku
where fc.producto_id = p.id;

-- 2) Limpia el espacio final que traía el nombre de LIM-0005 (antes de
--    renombrar, para que el where todavía la encuentre por su sku viejo).
update productos set nombre = trim(nombre)
where sku = 'LIM-0005' and nombre <> trim(nombre);

-- 3) Renombra el SKU del producto.
update productos p
set sku = m.sku_nuevo
from (values
  ('LIM-0007', 'ATB-0001'),
  ('LIM-0001', 'ATB-0002'),
  ('LIM-0030', 'ATC-0001'),
  ('LIM-0003', 'ATC-0002'),
  ('LIM-0009', 'ATM-0001'),
  ('COC-0004', 'ATM-0002'),
  ('LIM-0006', 'LP-0001'),
  ('LIM-0005', 'RLP-0001'),
  ('LIM-0008', 'RAT-0001'),
  ('LIM-0061', 'PLM-0001'),
  ('VES-0003', 'RM-0001'),
  ('VES-0001', 'JRN-0001'),
  ('PRO-0001', 'JRN-0002'),
  ('COR-0001', 'JPS-0001'),
  ('PRO-0003', 'JPS-0002'),
  ('COC-0005', 'JTH-0001'),
  ('COC-0001', 'PM6-0001')
) as m(sku_actual, sku_nuevo)
where p.sku = m.sku_actual;

-- Verificación — deberían salir los 17 con su SKU nuevo y sin nulos.
select sku, nombre, presentacion from productos where sku in (
  'ATB-0001','ATB-0002','ATC-0001','ATC-0002','ATM-0001','ATM-0002',
  'LP-0001','RLP-0001','RAT-0001','PLM-0001','RM-0001',
  'JRN-0001','JRN-0002','JPS-0001','JPS-0002','JTH-0001','PM6-0001'
) order by sku;
