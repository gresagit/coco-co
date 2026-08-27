-- ============================================================================
-- MIGRACION 014 - Folio automatico para tickets del punto de venta
-- ============================================================================
-- Ejecutar despues de migration_013_costo_por_unidad.sql

create table if not exists ventas_folio_contadores (
  sucursal_id uuid primary key references sucursales(id),
  ultimo_numero integer not null default 0
);

create or replace function siguiente_folio_venta(p_sucursal_id uuid)
returns text
language plpgsql
as $$
declare
  siguiente integer;
begin
  insert into ventas_folio_contadores (sucursal_id, ultimo_numero)
  values (p_sucursal_id, 1)
  on conflict (sucursal_id) do update
    set ultimo_numero = ventas_folio_contadores.ultimo_numero + 1
  returning ultimo_numero into siguiente;

  return 'VTA-' || lpad(siguiente::text, 6, '0');
end;
$$;

-- Las ventas anteriores conservan su folio nulo. Las nuevas ventas siempre
-- reciben uno desde la funcion atomica anterior.
