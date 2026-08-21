-- ============================================================================
-- MIGRACIÓN 010 — Repara productos sin "contador de folio"
-- ============================================================================
-- Corre este script en Supabase DESPUÉS de migration_009_pedidos_impresion.sql
--
-- Cada producto necesita una fila en folio_contadores para poder generar
-- códigos de barra (JAB-0001, JAB-0002...). Esa fila se crea sola cuando
-- das de alta un producto DESDE LA APP (/dashboard/productos), pero si algún
-- producto entró por otra vía (SQL manual, importación, seed) le puede
-- faltar — y eso truena justo al intentar generar sus códigos, con el error
-- "No hay contador de folio configurado para este producto".
--
-- Este script busca productos sin contador y les crea uno, usando el
-- prefijo de su SKU (ej. "JAB-0007" → prefijo "JAB") y arrancando el
-- contador en el número más alto que ya esté en uso por ese producto en
-- "piezas" (si nunca se han generado códigos, arranca en 0). Es seguro
-- correrlo más de una vez: solo toca productos que de verdad no tengan
-- contador.

insert into folio_contadores (producto_id, prefijo, ultimo_numero)
select
  p.id,
  upper(split_part(p.sku, '-', 1)),
  coalesce(
    (
      select max(substring(pz.folio_pieza from '(\d+)$')::int)
      from piezas pz
      where pz.producto_id = p.id
    ),
    0
  )
from productos p
left join folio_contadores fc on fc.producto_id = p.id
where fc.producto_id is null;
