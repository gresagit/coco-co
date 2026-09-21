-- ============================================================================
-- MIGRACIÓN 027 — Folios de productos empiezan en 0000
-- ============================================================================
-- La función anterior incrementaba el contador antes de devolverlo. Por eso
-- un contador nuevo en 0 comenzaba en 0001 y, si el contador se había
-- preparado con la cantidad de la tanda, podía comenzar en 0500.
--
-- Esta versión interpreta ultimo_numero como "siguiente número disponible".
-- Un producto nuevo genera PREFIJO-0000, luego 0001, 0002, etc.
-- No renumera piezas existentes: esas etiquetas pueden estar impresas,
-- escaneadas o relacionadas con movimientos históricos.
-- ============================================================================

create or replace function siguiente_folio_producto(p_producto_id uuid)
returns text as $$
declare
  v_prefijo text;
  v_num integer;
begin
  select prefijo, ultimo_numero into v_prefijo, v_num
  from folio_contadores
  where producto_id = p_producto_id
  for update;

  if not found then
    raise exception 'No hay contador de folio configurado para este producto';
  end if;

  update folio_contadores
  set ultimo_numero = v_num + 1
  where producto_id = p_producto_id;

  return v_prefijo || '-' || lpad(v_num::text, 4, '0');
end;
$$ language plpgsql;

-- Repara únicamente contadores de productos que todavía no tienen piezas.
-- Los productos con historial conservan el siguiente número ya alcanzado.
update folio_contadores fc
set ultimo_numero = 0
where not exists (
  select 1
  from piezas pz
  where pz.producto_id = fc.producto_id
);
