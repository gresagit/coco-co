-- Ejecutar en Supabase despues de migration_028_reparar_contadores_folios.sql.
-- Reserva una tanda de folios en una sola llamada y repara contadores atrasados.

create or replace function siguiente_folio_producto(p_producto_id uuid)
returns text
language plpgsql
as $$
declare
  v_prefijo text;
  v_num integer;
begin
  select prefijo, ultimo_numero
  into v_prefijo, v_num
  from folio_contadores
  where producto_id = p_producto_id
  for update;

  if not found then
    select upper(coalesce(nullif(split_part(sku, '-', 1), ''), 'PROD'))
    into v_prefijo
    from productos
    where id = p_producto_id;

    if not found then
      raise exception 'No existe el producto %', p_producto_id;
    end if;

    insert into folio_contadores (producto_id, prefijo, ultimo_numero)
    values (p_producto_id, v_prefijo, 0)
    on conflict (producto_id) do nothing;

    select prefijo, ultimo_numero
    into v_prefijo, v_num
    from folio_contadores
    where producto_id = p_producto_id
    for update;
  end if;

  select greatest(
    coalesce(v_num, 0),
    coalesce(max(substring(folio_pieza from '([0-9]+)$')::integer) + 1, 0)
  )
  into v_num
  from piezas
  where producto_id = p_producto_id;

  update folio_contadores
  set ultimo_numero = v_num + 1
  where producto_id = p_producto_id;

  return v_prefijo || '-' || lpad(v_num::text, 4, '0');
end;
$$;

create or replace function siguiente_folios_producto(p_producto_id uuid, p_cantidad integer)
returns text[]
language plpgsql
as $$
declare
  v_prefijo text;
  v_num integer;
  v_folios text[];
begin
  if p_cantidad is null or p_cantidad < 1 then
    raise exception 'La cantidad de folios debe ser mayor a cero';
  end if;

  select prefijo, ultimo_numero
  into v_prefijo, v_num
  from folio_contadores
  where producto_id = p_producto_id
  for update;

  if not found then
    select upper(coalesce(nullif(split_part(sku, '-', 1), ''), 'PROD'))
    into v_prefijo
    from productos
    where id = p_producto_id;

    if not found then
      raise exception 'No existe el producto %', p_producto_id;
    end if;

    insert into folio_contadores (producto_id, prefijo, ultimo_numero)
    values (p_producto_id, v_prefijo, 0)
    on conflict (producto_id) do nothing;

    select prefijo, ultimo_numero
    into v_prefijo, v_num
    from folio_contadores
    where producto_id = p_producto_id
    for update;
  end if;

  select greatest(
    coalesce(v_num, 0),
    coalesce(max(substring(folio_pieza from '([0-9]+)$')::integer) + 1, 0)
  )
  into v_num
  from piezas
  where producto_id = p_producto_id;

  update folio_contadores
  set ultimo_numero = v_num + p_cantidad
  where producto_id = p_producto_id;

  select array_agg(v_prefijo || '-' || lpad((v_num + serie)::text, 4, '0') order by serie)
  into v_folios
  from generate_series(0, p_cantidad - 1) as serie;

  return v_folios;
end;
$$;
