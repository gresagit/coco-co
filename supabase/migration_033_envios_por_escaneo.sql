-- Ejecutar despues de migration_032_pedidos_tienda_y_envios.sql.
-- Registra salidas pieza por pieza al escanear antes de empacar.

alter table piezas
  add column if not exists enviada_en timestamptz,
  add column if not exists enviada_por uuid references usuarios(id),
  add column if not exists pedido_tienda_id uuid references pedidos_tienda(id);

alter table piezas drop constraint if exists piezas_estado_check;
alter table piezas add constraint piezas_estado_check
  check (estado in ('Pendiente', 'Disponible', 'Vendida', 'Dañada/Reimpresa', 'Transferida', 'Enviado'));

create index if not exists idx_piezas_enviadas_sucursal_fecha
  on piezas (sucursal_id, enviada_en desc)
  where estado = 'Enviado';
create index if not exists idx_piezas_pedido_tienda
  on piezas (pedido_tienda_id, producto_id)
  where pedido_tienda_id is not null;

create or replace function enviar_pieza_escaneada(
  p_folio text,
  p_sucursal_id uuid,
  p_usuario_id uuid,
  p_pedido_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pieza piezas%rowtype;
  v_pedido pedidos_tienda%rowtype;
  v_item pedido_tienda_items%rowtype;
  v_stock numeric;
  v_reservado_total numeric;
  v_reserva_liberada numeric := 0;
  v_ya_enviadas numeric;
  v_pedido_externo_id text;
  v_pedido_completado boolean := false;
begin
  if p_pedido_id is not null then
    select *
    into v_pedido
    from pedidos_tienda
    where id = p_pedido_id
    for update;
    if not found then
      raise exception 'No se encontró el pedido online seleccionado.';
    end if;
    if v_pedido.sucursal_id <> p_sucursal_id then
      raise exception 'El pedido pertenece a otra sucursal.';
    end if;
    if v_pedido.estado <> 'Vendido' then
      raise exception 'Solo se pueden escanear pedidos online pagados y pendientes de envío.';
    end if;
    v_pedido_externo_id := v_pedido.pedido_externo_id;
  end if;

  select *
  into v_pieza
  from piezas
  where folio_pieza = btrim(p_folio)
  for update;
  if not found then
    raise exception 'No existe ninguna pieza con ese folio.';
  end if;
  if v_pieza.sucursal_id <> p_sucursal_id then
    raise exception 'Esta pieza pertenece a otra sucursal.';
  end if;
  if v_pieza.estado <> 'Disponible' then
    raise exception 'La pieza debe estar Disponible para registrarla como Enviado; estado actual: "%".', v_pieza.estado;
  end if;

  if p_pedido_id is not null then
    select *
    into v_item
    from pedido_tienda_items
    where pedido_id = p_pedido_id
      and producto_id = v_pieza.producto_id;
    if not found then
      raise exception 'El producto de esta etiqueta no pertenece al pedido seleccionado.';
    end if;
  end if;

  select cantidad_disponible
  into v_stock
  from producto_stock
  where producto_id = v_pieza.producto_id
    and sucursal_id = p_sucursal_id
  for update;
  if not found then
    raise exception 'No hay stock registrado para esta pieza en la sucursal.';
  end if;

  select coalesce(sum(pti.cantidad_reservada), 0)
  into v_reservado_total
  from pedido_tienda_items pti
  join pedidos_tienda pt on pt.id = pti.pedido_id
  where pti.producto_id = v_pieza.producto_id
    and pt.sucursal_id = p_sucursal_id
    and pt.estado = 'Vendido'
    and pt.enviado_en is null;

  if p_pedido_id is not null then
    select *
    into v_item
    from pedido_tienda_items
    where pedido_id = p_pedido_id
      and producto_id = v_pieza.producto_id
    for update;
    if not found then
      raise exception 'El producto de esta etiqueta no pertenece al pedido seleccionado.';
    end if;
    if v_item.cantidad <> trunc(v_item.cantidad) then
      raise exception 'El pedido tiene una cantidad fraccionaria; no se puede despachar con un código individual por pieza.';
    end if;

    select count(*)
    into v_ya_enviadas
    from piezas
    where pedido_tienda_id = p_pedido_id
      and producto_id = v_pieza.producto_id
      and estado = 'Enviado';
    if v_ya_enviadas >= v_item.cantidad then
      raise exception 'Ya se escanearon todas las unidades de este producto para el pedido.';
    end if;

    v_reserva_liberada := least(1, v_item.cantidad_reservada);
    if v_stock - v_reservado_total < 1 - v_reserva_liberada then
      raise exception 'Stock insuficiente para enviar esta unidad sin afectar reservas de otros pedidos.';
    end if;
    update pedido_tienda_items
    set cantidad_reservada = greatest(cantidad_reservada - v_reserva_liberada, 0)
    where id = v_item.id;
  elsif v_stock - v_reservado_total < 1 then
    raise exception 'No hay stock libre para venta física; las unidades disponibles están reservadas para pedidos online.';
  end if;

  update producto_stock
  set cantidad_disponible = cantidad_disponible - 1
  where producto_id = v_pieza.producto_id
    and sucursal_id = p_sucursal_id;

  update piezas
  set estado = 'Enviado',
      enviada_en = now(),
      enviada_por = p_usuario_id,
      pedido_tienda_id = p_pedido_id
  where id = v_pieza.id
    and estado = 'Disponible';
  if not found then
    raise exception 'La pieza ya fue procesada por otro usuario.';
  end if;

  insert into movimientos (
    tipo, origen_tipo, producto_id, sucursal_id, cantidad,
    referencia, usuario_id, notas
  ) values (
    'Salida', 'Producto', v_pieza.producto_id, p_sucursal_id, 1,
    coalesce('Pedido ' || v_pedido_externo_id, 'Venta física') || ' · ' || btrim(p_folio),
    p_usuario_id,
    case when p_pedido_id is null
      then 'Salida por venta física, registrada mediante escaneo'
      else 'Salida de pedido online, registrada mediante escaneo antes de empacar'
    end
  );

  if p_pedido_id is not null and not exists (
    select 1
    from pedido_tienda_items pti
    where pti.pedido_id = p_pedido_id
      and (
        select count(*)
        from piezas px
        where px.pedido_tienda_id = p_pedido_id
          and px.producto_id = pti.producto_id
          and px.estado = 'Enviado'
      ) < pti.cantidad
  ) then
    update pedidos_tienda
    set estado = 'Enviado',
        enviado_en = now(),
        enviado_por = p_usuario_id
    where id = p_pedido_id
      and estado = 'Vendido';
    v_pedido_completado := found;
  end if;

  return jsonb_build_object(
    'ok', true,
    'folio', btrim(p_folio),
    'productoId', v_pieza.producto_id,
    'productoNombre', (select nombre from productos where id = v_pieza.producto_id),
    'productoSku', (select sku from productos where id = v_pieza.producto_id),
    'pedidoExternoId', v_pedido_externo_id,
    'pedidoCompletado', v_pedido_completado
  );
end;
$$;

-- Evita una segunda salida por botón una vez que el escáner ya descontó cada pieza.
create or replace function enviar_pedido_tienda(p_pedido_id uuid, p_usuario_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pedido pedidos_tienda%rowtype;
begin
  select *
  into v_pedido
  from pedidos_tienda
  where id = p_pedido_id
  for update;
  if not found then
    raise exception 'No se encontró el pedido.';
  end if;
  if v_pedido.estado = 'Enviado' then
    return jsonb_build_object('pedidoId', p_pedido_id, 'estado', 'Enviado');
  end if;
  if v_pedido.estado <> 'Vendido' then
    raise exception 'Solo se pueden enviar pedidos pagados pendientes de envío.';
  end if;
  if exists (
    select 1
    from pedido_tienda_items pti
    where pti.pedido_id = p_pedido_id
      and (
        select count(*)
        from piezas px
        where px.pedido_tienda_id = p_pedido_id
          and px.producto_id = pti.producto_id
          and px.estado = 'Enviado'
      ) < pti.cantidad
  ) then
    raise exception 'Escanea cada pieza del pedido en Catálogo > Enviados antes de confirmar el despacho.';
  end if;

  update pedidos_tienda
  set estado = 'Enviado',
      enviado_en = now(),
      enviado_por = p_usuario_id
  where id = p_pedido_id;
  return jsonb_build_object('pedidoId', p_pedido_id, 'estado', 'Enviado');
end;
$$;

revoke all on function enviar_pieza_escaneada(text, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function enviar_pieza_escaneada(text, uuid, uuid, uuid) to service_role;
