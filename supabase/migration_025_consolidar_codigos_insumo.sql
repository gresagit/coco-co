-- ============================================================================
-- MIGRACIÓN 025 v2 — Consolida insumos con codigo_interno "largo" contra su
-- versión corta (MP-0000 / EMP-0000 / ETQ-0000 / INT-0000).
--
-- CAMBIO vs v1: ya NO usa la tabla intermedia `_dedup_insumos` (el editor de
-- Supabase corre cada bloque en su propia transacción/sesión, por eso salía
-- "relation _dedup_insumos does not exist"). Cada statement recalcula el
-- mapeo largo->corto con un CTE propio, así que puedes correr los bloques
-- uno por uno, en cualquier orden dentro del PASO 3, y volver a correr el
-- script completo sin que truene (es idempotente: al final ya no hay largos
-- que mapear y todos los statements afectan 0 filas).
--
-- ÚNICA REGLA DE ORDEN: el PASO 4 (delete) va HASTA EL FINAL. Mientras los
-- insumos largos sigan existiendo, el mapeo se puede recalcular; si los
-- borras antes, pierdes las referencias que faltaba repuntar.
--
-- SI QUIERES EXCLUIR UN PAR (falso positivo): agrega su código a la lista
-- `excluidos` — está en TODOS los statements, edítala igual en todos.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- PASO 0 — Helper de normalización (esto sí persiste, es una función)
-- ---------------------------------------------------------------------------
create or replace function _norm_txt(t text) returns text
language sql immutable as $$
  select regexp_replace(
           lower(translate(coalesce(t, ''),
                           'áéíóúüñÁÉÍÓÚÜÑ',
                           'aeiouunAEIOUUN')),
           '[^a-z0-9]', '', 'g')
$$;

-- ---------------------------------------------------------------------------
-- PASO 1 — DIAGNÓSTICO (solo lectura). Corre esto primero y revísalo.
-- ---------------------------------------------------------------------------

-- 1.a) Pares detectados: largo -> corto (mismo nombre normalizado y tipo)
with clasificados as (
  select id, codigo_interno, nombre, tipo, costo_unitario_actual,
         codigo_interno ~ '^(MP|EMP|ETQ|INT)-[0-9]{4}$' as es_corto,
         _norm_txt(nombre) as clave
  from insumos
),
cortos as (
  select distinct on (clave, tipo) id, codigo_interno, nombre, clave, tipo
  from clasificados
  where es_corto and length(clave) >= 3
  order by clave, tipo, codigo_interno
)
select l.codigo_interno as codigo_largo, l.nombre as nombre_largo,
       c.codigo_interno as codigo_corto, c.nombre as nombre_corto,
       l.tipo, l.costo_unitario_actual as costo_largo
from clasificados l
join cortos c on c.clave = l.clave and c.tipo = l.tipo
where not l.es_corto and l.id <> c.id
order by l.tipo, c.codigo_interno;

-- 1.b) Largos SIN gemelo corto (NO se borran; ver PASO C)
with clasificados as (
  select id, codigo_interno, nombre, tipo,
         codigo_interno ~ '^(MP|EMP|ETQ|INT)-[0-9]{4}$' as es_corto,
         _norm_txt(nombre) as clave
  from insumos
),
cortos as (
  select distinct clave, tipo from clasificados where es_corto and length(clave) >= 3
)
select l.codigo_interno, l.nombre, l.tipo
from clasificados l
left join cortos c on c.clave = l.clave and c.tipo = l.tipo
where not l.es_corto and c.clave is null
order by l.tipo, l.codigo_interno;

-- 1.c) Duplicados entre códigos CORTOS (revísalos a mano, el script no los toca)
select _norm_txt(nombre) as clave, tipo,
       array_agg(codigo_interno order by codigo_interno) as codigos
from insumos
where codigo_interno ~ '^(MP|EMP|ETQ|INT)-[0-9]{4}$' and length(_norm_txt(nombre)) >= 3
group by 1, 2
having count(*) > 1;

-- ---------------------------------------------------------------------------
-- PASO 3 — Repunta referencias del largo al corto
--   (cada bloque trae su propio mapeo; no depende de nada previo)
-- ---------------------------------------------------------------------------

-- 3.a.1) insumo_stock: crea la fila del corto en las sucursales donde no exista
with excluidos(codigo) as (values ('__ninguno__')),
clasificados as (
  select id, codigo_interno, nombre, tipo,
         codigo_interno ~ '^(MP|EMP|ETQ|INT)-[0-9]{4}$' as es_corto,
         _norm_txt(nombre) as clave
  from insumos
),
cortos as (
  select distinct on (clave, tipo) id, codigo_interno, clave, tipo
  from clasificados where es_corto and length(clave) >= 3
  order by clave, tipo, codigo_interno
),
map as (
  select l.id as id_largo, c.id as id_corto
  from clasificados l
  join cortos c on c.clave = l.clave and c.tipo = l.tipo
  where not l.es_corto and l.id <> c.id
    and l.codigo_interno not in (select codigo from excluidos)
)
insert into insumo_stock (insumo_id, sucursal_id, stock_minimo, cantidad_disponible)
select distinct m.id_corto, s.sucursal_id, 0, 0
from insumo_stock s
join map m on m.id_largo = s.insumo_id
where not exists (
  select 1 from insumo_stock t
  where t.insumo_id = m.id_corto and t.sucursal_id = s.sucursal_id
);

-- 3.a.2) insumo_stock: suma cantidades del largo al corto
with excluidos(codigo) as (values ('__ninguno__')),
clasificados as (
  select id, codigo_interno, nombre, tipo,
         codigo_interno ~ '^(MP|EMP|ETQ|INT)-[0-9]{4}$' as es_corto,
         _norm_txt(nombre) as clave
  from insumos
),
cortos as (
  select distinct on (clave, tipo) id, codigo_interno, clave, tipo
  from clasificados where es_corto and length(clave) >= 3
  order by clave, tipo, codigo_interno
),
map as (
  select l.id as id_largo, c.id as id_corto
  from clasificados l
  join cortos c on c.clave = l.clave and c.tipo = l.tipo
  where not l.es_corto and l.id <> c.id
    and l.codigo_interno not in (select codigo from excluidos)
),
agg as (
  select m.id_corto, s.sucursal_id,
         sum(s.cantidad_disponible) as cantidad,
         max(s.stock_minimo)        as minimo
  from insumo_stock s
  join map m on m.id_largo = s.insumo_id
  group by 1, 2
)
update insumo_stock t
set cantidad_disponible = t.cantidad_disponible + agg.cantidad,
    stock_minimo        = greatest(t.stock_minimo, agg.minimo)
from agg
where t.insumo_id = agg.id_corto and t.sucursal_id = agg.sucursal_id;

-- 3.a.3) insumo_stock: borra las filas del largo (ya sumadas arriba)
--   OJO: este delete SOLO se corre después de 3.a.2, si no pierdes el stock.
with excluidos(codigo) as (values ('__ninguno__')),
clasificados as (
  select id, codigo_interno, nombre, tipo,
         codigo_interno ~ '^(MP|EMP|ETQ|INT)-[0-9]{4}$' as es_corto,
         _norm_txt(nombre) as clave
  from insumos
),
cortos as (
  select distinct on (clave, tipo) id, clave, tipo
  from clasificados where es_corto and length(clave) >= 3
  order by clave, tipo, codigo_interno
),
map as (
  select l.id as id_largo
  from clasificados l
  join cortos c on c.clave = l.clave and c.tipo = l.tipo
  where not l.es_corto and l.id <> c.id
    and l.codigo_interno not in (select codigo from excluidos)
)
delete from insumo_stock s
using map m
where s.insumo_id = m.id_largo;

-- 3.b) insumo_lotes (FEFO): solo cambian de dueño
with excluidos(codigo) as (values ('__ninguno__')),
clasificados as (
  select id, codigo_interno, nombre, tipo,
         codigo_interno ~ '^(MP|EMP|ETQ|INT)-[0-9]{4}$' as es_corto,
         _norm_txt(nombre) as clave
  from insumos
),
cortos as (
  select distinct on (clave, tipo) id, codigo_interno, clave, tipo
  from clasificados where es_corto and length(clave) >= 3
  order by clave, tipo, codigo_interno
),
map as (
  select l.id as id_largo, c.id as id_corto
  from clasificados l
  join cortos c on c.clave = l.clave and c.tipo = l.tipo
  where not l.es_corto and l.id <> c.id
    and l.codigo_interno not in (select codigo from excluidos)
)
update insumo_lotes t
set insumo_id = m.id_corto
from map m
where t.insumo_id = m.id_largo;

-- 3.c.1) insumo_proveedores: inserta los pares que le falten al corto
with excluidos(codigo) as (values ('__ninguno__')),
clasificados as (
  select id, codigo_interno, nombre, tipo,
         codigo_interno ~ '^(MP|EMP|ETQ|INT)-[0-9]{4}$' as es_corto,
         _norm_txt(nombre) as clave
  from insumos
),
cortos as (
  select distinct on (clave, tipo) id, codigo_interno, clave, tipo
  from clasificados where es_corto and length(clave) >= 3
  order by clave, tipo, codigo_interno
),
map as (
  select l.id as id_largo, c.id as id_corto
  from clasificados l
  join cortos c on c.clave = l.clave and c.tipo = l.tipo
  where not l.es_corto and l.id <> c.id
    and l.codigo_interno not in (select codigo from excluidos)
)
insert into insumo_proveedores (insumo_id, proveedor_id, precio_historico, es_preferido)
select distinct on (m.id_corto, p.proveedor_id)
       m.id_corto, p.proveedor_id, p.precio_historico, p.es_preferido
from insumo_proveedores p
join map m on m.id_largo = p.insumo_id
where not exists (
  select 1 from insumo_proveedores t
  where t.insumo_id = m.id_corto and t.proveedor_id = p.proveedor_id
)
order by m.id_corto, p.proveedor_id, p.es_preferido desc;

-- 3.c.2) insumo_proveedores: borra los del largo
with excluidos(codigo) as (values ('__ninguno__')),
clasificados as (
  select id, codigo_interno, nombre, tipo,
         codigo_interno ~ '^(MP|EMP|ETQ|INT)-[0-9]{4}$' as es_corto,
         _norm_txt(nombre) as clave
  from insumos
),
cortos as (
  select distinct on (clave, tipo) id, clave, tipo
  from clasificados where es_corto and length(clave) >= 3
  order by clave, tipo, codigo_interno
),
map as (
  select l.id as id_largo
  from clasificados l
  join cortos c on c.clave = l.clave and c.tipo = l.tipo
  where not l.es_corto and l.id <> c.id
    and l.codigo_interno not in (select codigo from excluidos)
)
delete from insumo_proveedores p
using map m
where p.insumo_id = m.id_largo;

-- 3.d.1) BOM: si el producto YA usa el insumo corto, borra el renglón largo
with excluidos(codigo) as (values ('__ninguno__')),
clasificados as (
  select id, codigo_interno, nombre, tipo,
         codigo_interno ~ '^(MP|EMP|ETQ|INT)-[0-9]{4}$' as es_corto,
         _norm_txt(nombre) as clave
  from insumos
),
cortos as (
  select distinct on (clave, tipo) id, codigo_interno, clave, tipo
  from clasificados where es_corto and length(clave) >= 3
  order by clave, tipo, codigo_interno
),
map as (
  select l.id as id_largo, c.id as id_corto
  from clasificados l
  join cortos c on c.clave = l.clave and c.tipo = l.tipo
  where not l.es_corto and l.id <> c.id
    and l.codigo_interno not in (select codigo from excluidos)
)
delete from bom b
using map m
where b.insumo_id = m.id_largo
  and exists (
    select 1 from bom t
    where t.producto_id = b.producto_id and t.insumo_id = m.id_corto
  );

-- 3.d.2) BOM: repunta los renglones restantes
with excluidos(codigo) as (values ('__ninguno__')),
clasificados as (
  select id, codigo_interno, nombre, tipo,
         codigo_interno ~ '^(MP|EMP|ETQ|INT)-[0-9]{4}$' as es_corto,
         _norm_txt(nombre) as clave
  from insumos
),
cortos as (
  select distinct on (clave, tipo) id, codigo_interno, clave, tipo
  from clasificados where es_corto and length(clave) >= 3
  order by clave, tipo, codigo_interno
),
map as (
  select l.id as id_largo, c.id as id_corto
  from clasificados l
  join cortos c on c.clave = l.clave and c.tipo = l.tipo
  where not l.es_corto and l.id <> c.id
    and l.codigo_interno not in (select codigo from excluidos)
)
update bom b
set insumo_id = m.id_corto
from map m
where b.insumo_id = m.id_largo;

-- 3.e) movimientos
with excluidos(codigo) as (values ('__ninguno__')),
clasificados as (
  select id, codigo_interno, nombre, tipo,
         codigo_interno ~ '^(MP|EMP|ETQ|INT)-[0-9]{4}$' as es_corto,
         _norm_txt(nombre) as clave
  from insumos
),
cortos as (
  select distinct on (clave, tipo) id, codigo_interno, clave, tipo
  from clasificados where es_corto and length(clave) >= 3
  order by clave, tipo, codigo_interno
),
map as (
  select l.id as id_largo, c.id as id_corto
  from clasificados l
  join cortos c on c.clave = l.clave and c.tipo = l.tipo
  where not l.es_corto and l.id <> c.id
    and l.codigo_interno not in (select codigo from excluidos)
)
update movimientos t
set insumo_id = m.id_corto
from map m
where t.insumo_id = m.id_largo;

-- 3.f) orden_compra_items
with excluidos(codigo) as (values ('__ninguno__')),
clasificados as (
  select id, codigo_interno, nombre, tipo,
         codigo_interno ~ '^(MP|EMP|ETQ|INT)-[0-9]{4}$' as es_corto,
         _norm_txt(nombre) as clave
  from insumos
),
cortos as (
  select distinct on (clave, tipo) id, codigo_interno, clave, tipo
  from clasificados where es_corto and length(clave) >= 3
  order by clave, tipo, codigo_interno
),
map as (
  select l.id as id_largo, c.id as id_corto
  from clasificados l
  join cortos c on c.clave = l.clave and c.tipo = l.tipo
  where not l.es_corto and l.id <> c.id
    and l.codigo_interno not in (select codigo from excluidos)
)
update orden_compra_items t
set insumo_id = m.id_corto
from map m
where t.insumo_id = m.id_largo;

-- 3.g) reporte_consumo_insumos
with excluidos(codigo) as (values ('__ninguno__')),
clasificados as (
  select id, codigo_interno, nombre, tipo,
         codigo_interno ~ '^(MP|EMP|ETQ|INT)-[0-9]{4}$' as es_corto,
         _norm_txt(nombre) as clave
  from insumos
),
cortos as (
  select distinct on (clave, tipo) id, codigo_interno, clave, tipo
  from clasificados where es_corto and length(clave) >= 3
  order by clave, tipo, codigo_interno
),
map as (
  select l.id as id_largo, c.id as id_corto
  from clasificados l
  join cortos c on c.clave = l.clave and c.tipo = l.tipo
  where not l.es_corto and l.id <> c.id
    and l.codigo_interno not in (select codigo from excluidos)
)
update reporte_consumo_insumos t
set insumo_id = m.id_corto
from map m
where t.insumo_id = m.id_largo;

-- 3.h) alertas_generadas
with excluidos(codigo) as (values ('__ninguno__')),
clasificados as (
  select id, codigo_interno, nombre, tipo,
         codigo_interno ~ '^(MP|EMP|ETQ|INT)-[0-9]{4}$' as es_corto,
         _norm_txt(nombre) as clave
  from insumos
),
cortos as (
  select distinct on (clave, tipo) id, codigo_interno, clave, tipo
  from clasificados where es_corto and length(clave) >= 3
  order by clave, tipo, codigo_interno
),
map as (
  select l.id as id_largo, c.id as id_corto
  from clasificados l
  join cortos c on c.clave = l.clave and c.tipo = l.tipo
  where not l.es_corto and l.id <> c.id
    and l.codigo_interno not in (select codigo from excluidos)
)
update alertas_generadas t
set insumo_id = m.id_corto
from map m
where t.insumo_id = m.id_largo;

-- 3.i) Si el corto quedó en costo 0 y el largo sí tenía costo, hereda el costo
with excluidos(codigo) as (values ('__ninguno__')),
clasificados as (
  select id, codigo_interno, nombre, tipo, costo_unitario_actual,
         codigo_interno ~ '^(MP|EMP|ETQ|INT)-[0-9]{4}$' as es_corto,
         _norm_txt(nombre) as clave
  from insumos
),
cortos as (
  select distinct on (clave, tipo) id, codigo_interno, clave, tipo
  from clasificados where es_corto and length(clave) >= 3
  order by clave, tipo, codigo_interno
),
map as (
  select c.id as id_corto, max(l.costo_unitario_actual) as costo_largo
  from clasificados l
  join cortos c on c.clave = l.clave and c.tipo = l.tipo
  where not l.es_corto and l.id <> c.id
    and l.codigo_interno not in (select codigo from excluidos)
  group by c.id
)
update insumos i
set costo_unitario_actual = m.costo_largo
from map m
where i.id = m.id_corto
  and i.costo_unitario_actual = 0
  and m.costo_largo > 0;

-- ---------------------------------------------------------------------------
-- PASO 4 — Borra los insumos largos duplicados (HASTA EL FINAL)
-- ---------------------------------------------------------------------------
with excluidos(codigo) as (values ('__ninguno__')),
clasificados as (
  select id, codigo_interno, nombre, tipo,
         codigo_interno ~ '^(MP|EMP|ETQ|INT)-[0-9]{4}$' as es_corto,
         _norm_txt(nombre) as clave
  from insumos
),
cortos as (
  select distinct on (clave, tipo) id, clave, tipo
  from clasificados where es_corto and length(clave) >= 3
  order by clave, tipo, codigo_interno
),
map as (
  select l.id as id_largo
  from clasificados l
  join cortos c on c.clave = l.clave and c.tipo = l.tipo
  where not l.es_corto and l.id <> c.id
    and l.codigo_interno not in (select codigo from excluidos)
)
delete from insumos i
using map m
where i.id = m.id_largo;

-- ---------------------------------------------------------------------------
-- PASO C (OPCIONAL) — Renombra los largos que NO tenían gemelo corto al
-- siguiente correlativo de su tipo. Si prefieres dejarles su código
-- descriptivo, no corras este bloque.
-- ---------------------------------------------------------------------------
with prefijos as (
  select id, codigo_interno,
         case tipo
           when 'Materia Prima'       then 'MP'
           when 'Empaque'             then 'EMP'
           when 'Etiqueta'            then 'ETQ'
           when 'Producto Intermedio' then 'INT'
           else 'INS'
         end as prefijo
  from insumos
  where codigo_interno !~ '^(MP|EMP|ETQ|INT)-[0-9]{4}$'
),
maximos as (
  select p.prefijo,
         coalesce(max(substring(i.codigo_interno from '[0-9]{4}$')::int), 0) as ultimo
  from (select distinct prefijo from prefijos) p
  left join insumos i on i.codigo_interno ~ ('^' || p.prefijo || '-[0-9]{4}$')
  group by p.prefijo
),
nuevos as (
  select pr.id,
         pr.prefijo || '-' ||
         lpad((m.ultimo + row_number() over (partition by pr.prefijo order by pr.codigo_interno))::text,
              4, '0') as codigo_nuevo
  from prefijos pr
  join maximos m on m.prefijo = pr.prefijo
)
update insumos i
set codigo_interno = n.codigo_nuevo
from nuevos n
where i.id = n.id;

-- ---------------------------------------------------------------------------
-- PASO 5 — Verificación
-- ---------------------------------------------------------------------------

-- 0 filas = ya no quedan códigos fuera de formato
select codigo_interno, nombre, tipo
from insumos
where codigo_interno !~ '^(MP|EMP|ETQ|INT)-[0-9]{4}$';

-- 0 en todas = no hay referencias huérfanas
select 'bom' as tabla, count(*) from bom
  where insumo_id is not null and insumo_id not in (select id from insumos)
union all select 'insumo_stock', count(*) from insumo_stock
  where insumo_id not in (select id from insumos)
union all select 'insumo_lotes', count(*) from insumo_lotes
  where insumo_id not in (select id from insumos)
union all select 'movimientos', count(*) from movimientos
  where insumo_id is not null and insumo_id not in (select id from insumos);

-- Limpieza del helper (opcional)
drop function if exists _norm_txt(text);