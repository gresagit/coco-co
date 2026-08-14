import { supabaseAdmin } from "@/lib/supabase/server";

// Procesa un reporte de avance de producción:
// 1. Crea (o reutiliza) el lote de esta corrida.
// 2. Genera folios de pieza individuales, correlativos por producto.
// 3. Descuenta insumos del inventario según el BOM, proporcional a
//    (cantidad_producida + cantidad_merma), aplicando FEFO donde corresponda.
// 4. Suma la cantidad producida al stock de producto terminado de la sucursal.
export async function procesarReporteAvance(params: {
  ordenProduccionId: string;
  fecha: string;
  cantidadProducida: number;
  cantidadMerma: number;
  notas?: string;
  reportadoPor?: string;
}) {
  const db = supabaseAdmin();

  const { data: orden } = await db
    .from("ordenes_produccion")
    .select("*, productos(*)")
    .eq("id", params.ordenProduccionId)
    .single();
  if (!orden) throw new Error("Orden de producción no encontrada");

  // 1. Lote: uno por reporte, para trazabilidad granular
  const folioLote = `${orden.folio}-L${Date.now().toString().slice(-5)}`;
  const { data: lote } = await db
    .from("lotes")
    .insert({
      folio_lote: folioLote,
      orden_produccion_id: orden.id,
      producto_id: orden.producto_id,
      sucursal_id: orden.sucursal_id,
      cantidad_total: params.cantidadProducida,
      fecha_produccion: params.fecha,
    })
    .select()
    .single();
  if (!lote) throw new Error("No se pudo crear el lote");

  // 2. Reporte de avance
  const { data: reporte } = await db
    .from("reportes_avance")
    .insert({
      orden_produccion_id: orden.id,
      lote_id: lote.id,
      fecha: params.fecha,
      cantidad_producida: params.cantidadProducida,
      cantidad_merma: params.cantidadMerma,
      notas: params.notas,
      reportado_por: params.reportadoPor || null,
    })
    .select()
    .single();

  // 3. Piezas individuales (folio correlativo por producto)
  const piezas = [];
  for (let i = 0; i < params.cantidadProducida; i++) {
    const { data: folioData } = await db.rpc("siguiente_folio_producto", { p_producto_id: orden.producto_id });
    piezas.push({
      folio_pieza: folioData as string,
      lote_id: lote.id,
      producto_id: orden.producto_id,
      sucursal_id: orden.sucursal_id,
      estado: "Disponible",
    });
  }
  if (piezas.length) {
    await db.from("piezas").insert(piezas);
  }

  // 4. Descuento de insumos según BOM, proporcional a lo reportado (producido + merma)
  const cantidadBase = Number(params.cantidadProducida) + Number(params.cantidadMerma);
  const { data: bomItems } = await db
    .from("bom")
    .select("*")
    .eq("producto_id", orden.producto_id);

  for (const item of bomItems || []) {
    const cantidadNecesaria = Number(item.cantidad_por_unidad) * cantidadBase;
    if (cantidadNecesaria <= 0) continue;

    if (item.insumo_id) {
      await descontarInsumo(db, item.insumo_id, orden.sucursal_id, cantidadNecesaria, reporte?.id);
    } else if (item.insumo_producto_id) {
      // Receta anidada: descuenta del stock de producto terminado usado como insumo
      const { data: stockRow } = await db
        .from("producto_stock")
        .select("*")
        .eq("producto_id", item.insumo_producto_id)
        .eq("sucursal_id", orden.sucursal_id)
        .maybeSingle();
      if (stockRow) {
        await db
          .from("producto_stock")
          .update({ cantidad_disponible: Number(stockRow.cantidad_disponible) - cantidadNecesaria })
          .eq("id", stockRow.id);
      }
      await db.from("reporte_consumo_insumos").insert({
        reporte_avance_id: reporte?.id,
        insumo_producto_id: item.insumo_producto_id,
        cantidad_consumida: cantidadNecesaria,
      });
    }
  }

  // 5. Suma producto terminado al stock de la sucursal
  const { data: prodStock } = await db
    .from("producto_stock")
    .select("*")
    .eq("producto_id", orden.producto_id)
    .eq("sucursal_id", orden.sucursal_id)
    .maybeSingle();

  if (prodStock) {
    await db
      .from("producto_stock")
      .update({ cantidad_disponible: Number(prodStock.cantidad_disponible) + Number(params.cantidadProducida) })
      .eq("id", prodStock.id);
  }

  await db.from("movimientos").insert({
    tipo: "Entrada",
    origen_tipo: "Producto",
    producto_id: orden.producto_id,
    sucursal_id: orden.sucursal_id,
    cantidad: params.cantidadProducida,
    referencia: orden.folio,
    notas: `Reporte de avance · lote ${folioLote}`,
  });

  return { lote, reporte };
}

async function descontarInsumo(db: any, insumoId: string, sucursalId: string, cantidad: number, reporteId?: string) {
  const { data: insumo } = await db.from("insumos").select("*").eq("id", insumoId).single();
  if (!insumo) return;

  if (insumo.controla_caducidad) {
    // FEFO: descuenta de los lotes con caducidad más próxima primero
    let restante = cantidad;
    const { data: lotesInsumo } = await db
      .from("insumo_lotes")
      .select("*")
      .eq("insumo_id", insumoId)
      .eq("sucursal_id", sucursalId)
      .gt("cantidad_restante", 0)
      .order("fecha_caducidad", { ascending: true });

    for (const lote of lotesInsumo || []) {
      if (restante <= 0) break;
      const tomar = Math.min(Number(lote.cantidad_restante), restante);
      await db.from("insumo_lotes").update({ cantidad_restante: Number(lote.cantidad_restante) - tomar }).eq("id", lote.id);
      await db.from("reporte_consumo_insumos").insert({
        reporte_avance_id: reporteId,
        insumo_id: insumoId,
        cantidad_consumida: tomar,
        insumo_lote_id: lote.id,
      });
      restante -= tomar;
    }
  } else {
    await db.from("reporte_consumo_insumos").insert({
      reporte_avance_id: reporteId,
      insumo_id: insumoId,
      cantidad_consumida: cantidad,
    });
  }

  const { data: stockRow } = await db
    .from("insumo_stock")
    .select("*")
    .eq("insumo_id", insumoId)
    .eq("sucursal_id", sucursalId)
    .maybeSingle();

  if (stockRow) {
    await db
      .from("insumo_stock")
      .update({ cantidad_disponible: Number(stockRow.cantidad_disponible) - cantidad })
      .eq("id", stockRow.id);
  }

  await db.from("movimientos").insert({
    tipo: "Salida",
    origen_tipo: "Insumo",
    insumo_id: insumoId,
    sucursal_id: sucursalId,
    cantidad,
    referencia: "Consumo de producción (BOM)",
  });
}
