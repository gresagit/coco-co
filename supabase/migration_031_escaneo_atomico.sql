-- Ejecutar despues de migration_030_solicitudes_acceso.sql.
-- Aplica cada escaneo y sus cambios de inventario dentro de una transaccion.

create or replace function confirmar_pieza_escaneada(
  p_folio text,
  p_sucursal_id uuid,
  p_usuario_id uuid,
  p_consumos jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pieza piezas%rowtype;
  v_producto productos%rowtype;
  v_consumo jsonb;
  v_tipo text;
  v_insumo_id uuid;
  v_producto_insumo_id uuid;
  v_cantidad numeric;
  v_controla_caducidad boolean;
  v_lote record;
  v_restante numeric;
begin
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
  if v_pieza.estado <> 'Pendiente' then
    raise exception 'El folio % está en estado "%"; solo se pueden confirmar folios pendientes.', btrim(p_folio), v_pieza.estado;
  end if;

  select * into v_producto from productos where id = v_pieza.producto_id;
  if not found then
    raise exception 'El producto de este folio ya no existe.';
  end if;

  if jsonb_typeof(p_consumos) <> 'array' then
    raise exception 'No se pudo validar la fórmula del producto.';
  end if;

  for v_consumo in select value from jsonb_array_elements(p_consumos)
  loop
    v_tipo := v_consumo->>'tipo';
    v_cantidad := (v_consumo->>'cantidad')::numeric;
    if v_cantidad <= 0 then
      continue;
    end if;

    if v_tipo = 'insumo' then
      v_insumo_id := (v_consumo->>'id')::uuid;
      select controla_caducidad
      into v_controla_caducidad
      from insumos
      where id = v_insumo_id
      for share;
      if not found then
        raise exception 'Un insumo de la fórmula ya no existe.';
      end if;

      if v_controla_caducidad then
        v_restante := v_cantidad;
        for v_lote in
          select id, cantidad_restante
          from insumo_lotes
          where insumo_id = v_insumo_id
            and sucursal_id = p_sucursal_id
            and cantidad_restante > 0
          order by fecha_caducidad nulls last, created_at, id
          for update
        loop
          exit when v_restante <= 0;
          declare
            v_tomar numeric := least(v_lote.cantidad_restante, v_restante);
          begin
            update insumo_lotes
            set cantidad_restante = cantidad_restante - v_tomar
            where id = v_lote.id;
            insert into reporte_consumo_insumos (
              pieza_id, insumo_id, cantidad_consumida, insumo_lote_id
            ) values (
              v_pieza.id, v_insumo_id, v_tomar, v_lote.id
            );
            v_restante := v_restante - v_tomar;
          end;
        end loop;
        if v_restante > 0 then
          raise exception 'No hay suficiente cantidad registrada en lotes con caducidad para el insumo %.', v_insumo_id;
        end if;
      else
        insert into reporte_consumo_insumos (pieza_id, insumo_id, cantidad_consumida)
        values (v_pieza.id, v_insumo_id, v_cantidad);
      end if;

      insert into insumo_stock (insumo_id, sucursal_id, stock_minimo, cantidad_disponible)
      values (v_insumo_id, p_sucursal_id, 0, -v_cantidad)
      on conflict (insumo_id, sucursal_id) do update
      set cantidad_disponible = insumo_stock.cantidad_disponible - v_cantidad;

      insert into movimientos (
        tipo, origen_tipo, insumo_id, sucursal_id, cantidad, referencia, notas
      ) values (
        'Salida', 'Insumo', v_insumo_id, p_sucursal_id, v_cantidad,
        btrim(p_folio), 'Consumo de producción (BOM) por escaneo'
      );
    elsif v_tipo = 'producto' then
      v_producto_insumo_id := (v_consumo->>'id')::uuid;
      update producto_stock
      set cantidad_disponible = cantidad_disponible - v_cantidad
      where producto_id = v_producto_insumo_id
        and sucursal_id = p_sucursal_id;
      if not found then
        insert into producto_stock (producto_id, sucursal_id, stock_minimo, cantidad_disponible)
        values (v_producto_insumo_id, p_sucursal_id, 0, -v_cantidad)
        on conflict (producto_id, sucursal_id) do update
        set cantidad_disponible = producto_stock.cantidad_disponible - v_cantidad;
      end if;
      insert into reporte_consumo_insumos (pieza_id, insumo_producto_id, cantidad_consumida)
      values (v_pieza.id, v_producto_insumo_id, v_cantidad);
      insert into movimientos (
        tipo, origen_tipo, producto_id, sucursal_id, cantidad, referencia, notas
      ) values (
        'Salida', 'Producto', v_producto_insumo_id, p_sucursal_id, v_cantidad,
        btrim(p_folio), 'Consumo de producto intermedio por escaneo'
      );
    else
      raise exception 'La fórmula contiene un tipo de componente inválido.';
    end if;
  end loop;

  insert into producto_stock (producto_id, sucursal_id, stock_minimo, cantidad_disponible)
  values (v_pieza.producto_id, p_sucursal_id, 0, 1)
  on conflict (producto_id, sucursal_id) do update
  set cantidad_disponible = producto_stock.cantidad_disponible + 1;

  update piezas
  set estado = 'Disponible',
      escaneada_en = now(),
      escaneada_por = p_usuario_id
  where id = v_pieza.id
    and estado = 'Pendiente';
  if not found then
    raise exception 'El folio ya fue procesado por otro usuario.';
  end if;

  insert into movimientos (
    tipo, origen_tipo, producto_id, sucursal_id, cantidad, referencia, usuario_id, notas
  ) values (
    'Entrada', 'Producto', v_pieza.producto_id, p_sucursal_id, 1,
    btrim(p_folio), p_usuario_id, 'Alta por escaneo de código de barra'
  );

  return jsonb_build_object(
    'ok', true,
    'folio', btrim(p_folio),
    'productoId', v_pieza.producto_id,
    'productoNombre', v_producto.nombre,
    'productoSku', v_producto.sku
  );
end;
$$;

revoke all on function confirmar_pieza_escaneada(text, uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function confirmar_pieza_escaneada(text, uuid, uuid, jsonb) to service_role;
