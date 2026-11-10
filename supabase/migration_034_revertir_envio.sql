create or replace function public.revertir_envio_pieza(
  p_folio text,
  p_sucursal_id uuid,
  p_usuario_id uuid,
  p_motivo text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pieza record;
  v_filas_stock integer;
begin
  if p_folio is null or trim(p_folio) = '' then
    raise exception 'Debes indicar el folio de la pieza.';
  end if;

  select *
  into v_pieza
  from public.piezas
  where folio_pieza = trim(p_folio)
    and sucursal_id = p_sucursal_id
  for update;

  if v_pieza is null then
    raise exception 'No existe la pieza % en la sucursal indicada.', trim(p_folio);
  end if;

  if v_pieza.estado <> 'Enviado' then
    raise exception 'La pieza % no está en estado Enviado.', trim(p_folio);
  end if;

  if v_pieza.pedido_tienda_id is not null then
    raise exception 'La pieza % pertenece a un pedido y no se puede devolver a Disponible sin reabrir la reserva.', trim(p_folio);
  end if;

  update public.piezas
  set
    estado = 'Disponible',
    enviada_en = null,
    enviada_por = null,
    pedido_tienda_id = null,
    escaneada_en = coalesce(escaneada_en, now()),
    escaneada_por = coalesce(escaneada_por, p_usuario_id)
  where id = v_pieza.id;

  update public.producto_stock
  set cantidad_disponible = cantidad_disponible + 1
  where producto_id = v_pieza.producto_id and sucursal_id = v_pieza.sucursal_id;
  get diagnostics v_filas_stock = row_count;

  if v_filas_stock <> 1 then
    raise exception 'Se esperaba una fila de stock para el producto y sucursal; se encontraron %.', v_filas_stock;
  end if;

  insert into public.movimientos (
    tipo,
    origen_tipo,
    producto_id,
    sucursal_id,
    cantidad,
    referencia,
    notas
  )
  values (
    'Entrada',
    'Producto',
    v_pieza.producto_id,
    v_pieza.sucursal_id,
    1,
    trim(p_folio),
    coalesce(nullif(trim(p_motivo), ''), 'Corrección manual: reversa de envío')
  );
end;
$$;

revoke all on function public.revertir_envio_pieza(text, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.revertir_envio_pieza(text, uuid, uuid, text) to service_role;
