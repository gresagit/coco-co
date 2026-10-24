-- Ejecutar despues de migration_031_escaneo_atomico.sql.
-- Pedidos pagados reservan stock; el inventario fisico se descuenta al enviar.

create table if not exists pedidos_tienda (
  id uuid primary key default gen_random_uuid(),
  fuente text not null default 'godaddy' check (fuente = 'godaddy'),
  pedido_externo_id text not null,
  sucursal_id uuid not null references sucursales(id),
  estado text not null default 'Pendiente'
    check (estado in ('Pendiente', 'Vendido', 'Enviado', 'Cancelado')),
  estado_pago text not null default 'Pendiente',
  cliente jsonb not null default '{}'::jsonb,
  direccion_envio jsonb not null default '{}'::jsonb,
  creado_externo_en timestamptz,
  creado_en timestamptz not null default now(),
  enviado_en timestamptz,
  enviado_por uuid references usuarios(id),
  unique (fuente, pedido_externo_id)
);

create table if not exists pedido_tienda_items (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references pedidos_tienda(id) on delete cascade,
  producto_id uuid not null references productos(id),
  sku text not null,
  nombre_producto text not null,
  cantidad numeric(12,2) not null check (cantidad > 0),
  cantidad_reservada numeric(12,2) not null default 0
    check (cantidad_reservada >= 0 and cantidad_reservada <= cantidad),
  precio_unitario numeric(12,4) not null default 0 check (precio_unitario >= 0),
  total numeric(12,2) not null default 0 check (total >= 0)
);

create index if not exists idx_pedidos_tienda_sucursal_estado
  on pedidos_tienda (sucursal_id, estado, creado_en desc);
create index if not exists idx_pedido_tienda_items_pedido
  on pedido_tienda_items (pedido_id);
create index if not exists idx_pedido_tienda_items_producto
  on pedido_tienda_items (producto_id);

alter table pedidos_tienda enable row level security;
alter table pedido_tienda_items enable row level security;
revoke all on pedidos_tienda, pedido_tienda_items from anon, authenticated;
grant all on pedidos_tienda, pedido_tienda_items to service_role;

alter table ordenes_produccion
  add column if not exists pedido_tienda_id uuid references pedidos_tienda(id);
create unique index if not exists idx_orden_produccion_pedido_producto
  on ordenes_produccion (pedido_tienda_id, producto_id)
  where pedido_tienda_id is not null;

-- El equipo de producción prepara y envía los pedidos del canal online.
update roles
set permisos = jsonb_set(
  coalesce(permisos, '{}'::jsonb),
  '{pedidos_online}',
  '["ver","editar"]'::jsonb,
  true
)
where lower(nombre) in ('produccion', 'producción');

create or replace function reservar_pedidos_tienda_al_recibir_stock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item record;
  v_reservado numeric;
  v_disponible numeric;
  v_a_reservar numeric;
begin
  select coalesce(sum(pti.cantidad_reservada), 0)
  into v_reservado
  from pedido_tienda_items pti
  join pedidos_tienda pt on pt.id = pti.pedido_id
  where pti.producto_id = new.producto_id
    and pt.sucursal_id = new.sucursal_id
    and pt.estado = 'Vendido'
    and pt.enviado_en is null;

  v_disponible := greatest(new.cantidad_disponible - v_reservado, 0);
  for v_item in
    select pti.id, pti.cantidad, pti.cantidad_reservada
    from pedido_tienda_items pti
    join pedidos_tienda pt on pt.id = pti.pedido_id
    where pti.producto_id = new.producto_id
      and pt.sucursal_id = new.sucursal_id
      and pt.estado = 'Vendido'
      and pt.enviado_en is null
      and pti.cantidad_reservada < pti.cantidad
    order by pt.creado_en, pt.id
    for update of pti
  loop
    exit when v_disponible <= 0;
    v_a_reservar := least(v_item.cantidad - v_item.cantidad_reservada, v_disponible);
    update pedido_tienda_items
    set cantidad_reservada = cantidad_reservada + v_a_reservar
    where id = v_item.id
      and cantidad_reservada < cantidad
      and exists (
        select 1 from pedidos_tienda
        where id = pedido_tienda_items.pedido_id
          and estado = 'Vendido'
          and enviado_en is null
      );
    if found then
      v_disponible := v_disponible - v_a_reservar;
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists trg_reservar_pedidos_tienda_stock_insert on producto_stock;
create trigger trg_reservar_pedidos_tienda_stock_insert
after insert on producto_stock
for each row
when (new.cantidad_disponible > 0)
execute function reservar_pedidos_tienda_al_recibir_stock();

drop trigger if exists trg_reservar_pedidos_tienda_stock_update on producto_stock;
create trigger trg_reservar_pedidos_tienda_stock_update
after update of cantidad_disponible on producto_stock
for each row
when (new.cantidad_disponible > old.cantidad_disponible)
execute function reservar_pedidos_tienda_al_recibir_stock();

create or replace function recibir_pedido_godaddy(
  p_pedido_externo_id text,
  p_sucursal_id uuid,
  p_estado_pago text,
  p_cliente jsonb,
  p_direccion_envio jsonb,
  p_creado_externo_en timestamptz,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pedido_id uuid;
  v_estado text;
  v_pago text := lower(coalesce(p_estado_pago, ''));
  v_item jsonb;
  v_producto record;
  v_cantidad numeric;
  v_precio numeric;
  v_stock numeric;
  v_reservado numeric;
  v_disponible numeric;
  v_cantidad_a_reservar numeric;
  v_ya_existia boolean := false;
begin
  if nullif(btrim(p_pedido_externo_id), '') is null then
    raise exception 'Falta el identificador externo del pedido.';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'El pedido debe incluir al menos un producto.';
  end if;
  if not exists (select 1 from sucursales where id = p_sucursal_id and activa) then
    raise exception 'La sucursal configurada para pedidos online no existe o está inactiva.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('godaddy:' || btrim(p_pedido_externo_id), 0));

  select id, estado
  into v_pedido_id, v_estado
  from pedidos_tienda
  where fuente = 'godaddy'
    and pedido_externo_id = btrim(p_pedido_externo_id)
  for update;

  if found then
    v_ya_existia := true;
    if v_estado = 'Pendiente' and v_pago in ('paid', 'pagado', 'complete', 'completed', 'succeeded') then
      update pedidos_tienda
      set estado = 'Vendido',
          estado_pago = 'Pagado'
      where id = v_pedido_id;
    else
      return jsonb_build_object('pedidoId', v_pedido_id, 'duplicado', true, 'estado', v_estado);
    end if;
  else
    v_estado := case
      when v_pago in ('paid', 'pagado', 'complete', 'completed', 'succeeded') then 'Vendido'
      else 'Pendiente'
    end;
    insert into pedidos_tienda (
      fuente, pedido_externo_id, sucursal_id, estado, estado_pago,
      cliente, direccion_envio, creado_externo_en
    ) values (
      'godaddy', btrim(p_pedido_externo_id), p_sucursal_id, v_estado,
      case when v_estado = 'Vendido' then 'Pagado' else 'Pendiente' end,
      coalesce(p_cliente, '{}'::jsonb),
      coalesce(p_direccion_envio, '{}'::jsonb),
      p_creado_externo_en
    )
    returning id into v_pedido_id;
  end if;

  if not v_ya_existia then
    for v_item in
      select value
      from jsonb_array_elements(p_items)
      order by upper(btrim(value->>'sku'))
    loop
      if nullif(btrim(v_item->>'sku'), '') is null then
        raise exception 'Todos los productos del pedido deben incluir SKU.';
      end if;
      v_cantidad := (v_item->>'cantidad')::numeric;
      v_precio := coalesce(nullif(v_item->>'precioUnitario', '')::numeric, 0);
      if v_cantidad <= 0 or v_precio < 0 then
        raise exception 'El pedido contiene una cantidad o precio inválido.';
      end if;

      select id, sku, nombre
      into v_producto
      from productos
      where upper(sku) = upper(btrim(v_item->>'sku'))
        and activo = true
      limit 1;
      if not found then
        raise exception 'No existe un producto activo con SKU %.', btrim(v_item->>'sku');
      end if;

      insert into pedido_tienda_items (
        pedido_id, producto_id, sku, nombre_producto, cantidad,
        precio_unitario, total
      ) values (
        v_pedido_id, v_producto.id, v_producto.sku, v_producto.nombre,
        v_cantidad, v_precio, round(v_cantidad * v_precio, 2)
      );
    end loop;
  end if;

  if exists (select 1 from pedidos_tienda where id = v_pedido_id and estado = 'Vendido') then
    for v_item in
      select pti.id, pti.producto_id, pti.cantidad, pti.cantidad_reservada
      from pedido_tienda_items pti
      where pti.pedido_id = v_pedido_id
      order by pti.producto_id
    loop
      if v_item.cantidad_reservada >= v_item.cantidad then
        continue;
      end if;

      insert into producto_stock (producto_id, sucursal_id, stock_minimo, cantidad_disponible)
      values (v_item.producto_id, p_sucursal_id, 0, 0)
      on conflict (producto_id, sucursal_id) do nothing;

      select cantidad_disponible
      into v_stock
      from producto_stock
      where producto_id = v_item.producto_id
        and sucursal_id = p_sucursal_id
      for update;

      select coalesce(sum(pti.cantidad_reservada), 0)
      into v_reservado
      from pedido_tienda_items pti
      join pedidos_tienda pt on pt.id = pti.pedido_id
      where pti.producto_id = v_item.producto_id
        and pt.sucursal_id = p_sucursal_id
        and pt.estado = 'Vendido'
        and pt.enviado_en is null;

      v_disponible := greatest(v_stock - v_reservado, 0);
      v_cantidad_a_reservar := least(v_item.cantidad - v_item.cantidad_reservada, v_disponible);
      if v_cantidad_a_reservar > 0 then
        update pedido_tienda_items
        set cantidad_reservada = cantidad_reservada + v_cantidad_a_reservar
        where id = v_item.id;
      end if;
    end loop;
  end if;

  return jsonb_build_object(
    'pedidoId', v_pedido_id,
    'duplicado', v_ya_existia,
    'estado', case when v_pago in ('paid', 'pagado', 'complete', 'completed', 'succeeded') then 'Vendido' else 'Pendiente' end
  );
end;
$$;

create or replace function enviar_pedido_tienda(p_pedido_id uuid, p_usuario_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pedido pedidos_tienda%rowtype;
  v_item record;
  v_stock numeric;
  v_reservado_por_otros numeric;
  v_faltante_reserva numeric;
begin
  select *
  into v_pedido
  from pedidos_tienda
  where id = p_pedido_id
  for update;
  if not found then
    raise exception 'No se encontró el pedido.';
  end if;
  if v_pedido.estado <> 'Vendido' then
    raise exception 'Solo se pueden enviar pedidos pagados que estén en estado Vendido.';
  end if;

  for v_item in
    select id, producto_id, sku, cantidad, cantidad_reservada
    from pedido_tienda_items
    where pedido_id = p_pedido_id
    order by producto_id
  loop
    select cantidad_disponible
    into v_stock
    from producto_stock
    where producto_id = v_item.producto_id
      and sucursal_id = v_pedido.sucursal_id
    for update;
    if not found then
      raise exception 'No hay stock registrado para % en la sucursal del pedido.', v_item.sku;
    end if;

    select coalesce(sum(pti.cantidad_reservada), 0)
    into v_reservado_por_otros
    from pedido_tienda_items pti
    join pedidos_tienda pt on pt.id = pti.pedido_id
    where pti.producto_id = v_item.producto_id
      and pt.sucursal_id = v_pedido.sucursal_id
      and pt.estado = 'Vendido'
      and pt.enviado_en is null
      and pt.id <> p_pedido_id;

    v_faltante_reserva := v_item.cantidad - v_item.cantidad_reservada;
    if v_stock - v_reservado_por_otros < v_item.cantidad then
      raise exception 'Stock insuficiente para enviar %: faltan % unidades.', v_item.sku,
        greatest(v_item.cantidad - (v_stock - v_reservado_por_otros), 0);
    end if;

    update producto_stock
    set cantidad_disponible = cantidad_disponible - v_item.cantidad
    where producto_id = v_item.producto_id
      and sucursal_id = v_pedido.sucursal_id;

    insert into movimientos (
      tipo, origen_tipo, producto_id, sucursal_id, cantidad,
      referencia, usuario_id, notas
    ) values (
      'Salida', 'Producto', v_item.producto_id, v_pedido.sucursal_id, v_item.cantidad,
      'GoDaddy ' || v_pedido.pedido_externo_id, p_usuario_id,
      'Pedido de tienda online enviado por paquetería'
    );

    if v_faltante_reserva > 0 then
      update pedido_tienda_items
      set cantidad_reservada = cantidad
      where id = v_item.id;
    end if;
  end loop;

  update pedidos_tienda
  set estado = 'Enviado',
      enviado_en = now(),
      enviado_por = p_usuario_id
  where id = p_pedido_id;

  return jsonb_build_object('pedidoId', p_pedido_id, 'estado', 'Enviado');
end;
$$;

create or replace function cancelar_pedido_tienda(p_pedido_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estado text;
begin
  select estado
  into v_estado
  from pedidos_tienda
  where id = p_pedido_id
  for update;
  if not found then
    raise exception 'No se encontró el pedido.';
  end if;
  if v_estado = 'Enviado' then
    raise exception 'No se puede cancelar un pedido que ya fue enviado.';
  end if;
  if v_estado = 'Cancelado' then
    raise exception 'El pedido ya está cancelado.';
  end if;

  update pedidos_tienda
  set estado = 'Cancelado',
      estado_pago = 'Cancelado'
  where id = p_pedido_id;
  update pedido_tienda_items
  set cantidad_reservada = 0
  where pedido_id = p_pedido_id;

  return jsonb_build_object('pedidoId', p_pedido_id, 'estado', 'Cancelado');
end;
$$;

create or replace function crear_ordenes_produccion_pedido(p_pedido_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pedido pedidos_tienda%rowtype;
  v_item record;
  v_faltante numeric;
  v_folio text;
  v_cantidad numeric := 0;
  v_creadas integer := 0;
begin
  select * into v_pedido
  from pedidos_tienda
  where id = p_pedido_id
  for update;
  if not found or v_pedido.estado <> 'Vendido' then
    raise exception 'Solo se puede planear producción para pedidos pagados.';
  end if;

  for v_item in
    select pti.producto_id, pti.sku, pti.cantidad, pti.cantidad_reservada
    from pedido_tienda_items pti
    where pti.pedido_id = p_pedido_id
    order by pti.producto_id
  loop
    v_faltante := greatest(v_item.cantidad - least(v_item.cantidad_reservada, v_item.cantidad), 0);
    if v_faltante > 0 and not exists (
      select 1 from ordenes_produccion
      where pedido_tienda_id = p_pedido_id
        and producto_id = v_item.producto_id
        and estado not in ('Cancelada', 'Cerrada')
    ) then
      v_cantidad := v_faltante;
      v_folio := 'OP-WEB-' || upper(substr(replace(p_pedido_id::text, '-', ''), 1, 10))
        || '-' || upper(substr(replace(v_item.producto_id::text, '-', ''), 1, 6));
      insert into ordenes_produccion (
        folio, producto_id, sucursal_id, cantidad_planeada, frecuencia_reporte,
        estado, aprobacion_estado, pedido_tienda_id
      ) values (
        v_folio, v_item.producto_id, v_pedido.sucursal_id, v_cantidad, 'semanal',
        'Abierta', 'Pendiente', p_pedido_id
      )
      on conflict (pedido_tienda_id, producto_id)
        where pedido_tienda_id is not null do nothing;
      if found then
        v_creadas := v_creadas + 1;
      end if;
    end if;
  end loop;

  return v_creadas;
end;
$$;

create or replace function registrar_venta_pos_atomica(
  p_sucursal_id uuid,
  p_usuario_id uuid,
  p_lineas jsonb,
  p_notas text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_producto record;
  v_linea jsonb;
  v_stock numeric;
  v_reservado numeric;
begin
  if jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'La venta debe incluir al menos un producto.';
  end if;

  for v_producto in
    select (value->>'producto_id')::uuid as producto_id,
      sum((value->>'cantidad')::numeric) as cantidad
    from jsonb_array_elements(p_lineas)
    group by (value->>'producto_id')::uuid
    order by (value->>'producto_id')::uuid
  loop
    if v_producto.cantidad <= 0 then
      raise exception 'La venta contiene una cantidad inválida.';
    end if;
    select cantidad_disponible
    into v_stock
    from producto_stock
    where producto_id = v_producto.producto_id
      and sucursal_id = p_sucursal_id
    for update;
    if not found then
      raise exception 'No hay stock registrado para el producto %.', v_producto.producto_id;
    end if;

    select coalesce(sum(pti.cantidad_reservada), 0)
    into v_reservado
    from pedido_tienda_items pti
    join pedidos_tienda pt on pt.id = pti.pedido_id
    where pti.producto_id = v_producto.producto_id
      and pt.sucursal_id = p_sucursal_id
      and pt.estado = 'Vendido'
      and pt.enviado_en is null;

    if v_stock - v_reservado < v_producto.cantidad then
      raise exception 'Stock insuficiente: disponibles %, reservados %, solicitados %.',
        greatest(v_stock - v_reservado, 0), v_reservado, v_producto.cantidad;
    end if;

    update producto_stock
    set cantidad_disponible = cantidad_disponible - v_producto.cantidad
    where producto_id = v_producto.producto_id
      and sucursal_id = p_sucursal_id;

    insert into movimientos (
      tipo, origen_tipo, producto_id, sucursal_id, cantidad, referencia, usuario_id, notas
    ) values (
      'Salida', 'Producto', v_producto.producto_id, p_sucursal_id, v_producto.cantidad,
      'Venta POS ' || coalesce(p_lineas->0->>'folio_pos', ''), p_usuario_id,
      coalesce(p_notas, 'Venta registrada desde punto de venta')
    );
  end loop;

  for v_linea in select value from jsonb_array_elements(p_lineas)
  loop
    insert into ventas_pos (
      sucursal_id, producto_id, cantidad, precio_unitario, total, medio_pago,
      folio_pos, notas, registrada_por, venta_grupo_id, cliente_id, cliente_tipo,
      cliente_nombre, cliente_apellido, cliente_telefono, cliente_empresa,
      cliente_responsable, cliente_telefono_responsable, cliente_correo_responsable,
      cliente_lugar_origen, cliente_volumen_compra, cliente_productos_interes
    ) values (
      (v_linea->>'sucursal_id')::uuid,
      (v_linea->>'producto_id')::uuid,
      (v_linea->>'cantidad')::numeric,
      (v_linea->>'precio_unitario')::numeric,
      (v_linea->>'total')::numeric,
      v_linea->>'medio_pago',
      v_linea->>'folio_pos',
      nullif(v_linea->>'notas', ''),
      p_usuario_id,
      (v_linea->>'venta_grupo_id')::uuid,
      nullif(v_linea->>'cliente_id', '')::uuid,
      v_linea->>'cliente_tipo',
      v_linea->>'cliente_nombre',
      v_linea->>'cliente_apellido',
      v_linea->>'cliente_telefono',
      v_linea->>'cliente_empresa',
      v_linea->>'cliente_responsable',
      v_linea->>'cliente_telefono_responsable',
      v_linea->>'cliente_correo_responsable',
      v_linea->>'cliente_lugar_origen',
      v_linea->>'cliente_volumen_compra',
      v_linea->>'cliente_productos_interes'
    );
  end loop;

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function incrementar_stock_producto(
  p_producto_id uuid,
  p_sucursal_id uuid,
  p_cantidad numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_cantidad <= 0 then
    raise exception 'La cantidad de entrada debe ser mayor que cero.';
  end if;

  insert into producto_stock (producto_id, sucursal_id, stock_minimo, cantidad_disponible)
  values (p_producto_id, p_sucursal_id, 0, p_cantidad)
  on conflict (producto_id, sucursal_id) do update
  set cantidad_disponible = producto_stock.cantidad_disponible + excluded.cantidad_disponible;
end;
$$;

revoke all on function recibir_pedido_godaddy(text, uuid, text, jsonb, jsonb, timestamptz, jsonb) from public, anon, authenticated;
revoke all on function reservar_pedidos_tienda_al_recibir_stock() from public, anon, authenticated;
revoke all on function enviar_pedido_tienda(uuid, uuid) from public, anon, authenticated;
revoke all on function cancelar_pedido_tienda(uuid) from public, anon, authenticated;
revoke all on function crear_ordenes_produccion_pedido(uuid) from public, anon, authenticated;
revoke all on function registrar_venta_pos_atomica(uuid, uuid, jsonb, text) from public, anon, authenticated;
revoke all on function incrementar_stock_producto(uuid, uuid, numeric) from public, anon, authenticated;
grant execute on function recibir_pedido_godaddy(text, uuid, text, jsonb, jsonb, timestamptz, jsonb) to service_role;
grant execute on function enviar_pedido_tienda(uuid, uuid) to service_role;
grant execute on function cancelar_pedido_tienda(uuid) to service_role;
grant execute on function crear_ordenes_produccion_pedido(uuid) to service_role;
grant execute on function registrar_venta_pos_atomica(uuid, uuid, jsonb, text) to service_role;
grant execute on function incrementar_stock_producto(uuid, uuid, numeric) to service_role;
