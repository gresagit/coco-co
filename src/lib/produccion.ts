import { supabaseAdmin } from "@/lib/supabase/server";
import { descontarInsumo } from "@/lib/insumo-consumo";
import { convertirCantidad } from "@/lib/unidades";

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

  const { data: orden, error: errorOrden } = await db
    .from("ordenes_produccion")
    .select("*, productos(*)")
    .eq("id", params.ordenProduccionId)
    .single();
  if (errorOrden) throw errorOrden;
  if (!orden) throw new Error("Orden de producción no encontrada");

  const cantidadPiezas = Math.ceil(params.cantidadProducida);
  const { data: folios, error: errorFolios } = await db.rpc("siguiente_folios_producto", {
    p_producto_id: orden.producto_id,
    p_cantidad: cantidadPiezas,
  });
  if (errorFolios) throw errorFolios;
  if (!folios || folios.length !== cantidadPiezas) {
    throw new Error("No se pudieron reservar los folios de las piezas.");
  }

  // 1. Lote: uno por reporte, para trazabilidad granular
  const folioLote = `${orden.folio}-L${Date.now().toString().slice(-5)}`;
  const { data: lote, error: errorLote } = await db
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
  if (errorLote) throw errorLote;
  if (!lote) throw new Error("No se pudo crear el lote");

  // 2. Reporte de avance
  const { data: reporte, error: errorReporte } = await db
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
  if (errorReporte) throw errorReporte;
  if (!reporte) throw new Error("No se pudo guardar el reporte de avance.");

  // 3. Piezas individuales (folio correlativo por producto)
  const piezas = folios.map((folio: string) => ({
    folio_pieza: folio,
    lote_id: lote.id,
    producto_id: orden.producto_id,
    sucursal_id: orden.sucursal_id,
    estado: "Disponible",
  }));
  if (piezas.length) {
    const { error } = await db.from("piezas").insert(piezas);
    if (error) throw error;
  }

  // 4. Descuento de insumos según BOM, proporcional a lo reportado (producido + merma)
  const cantidadBase = Number(params.cantidadProducida) + Number(params.cantidadMerma);
  const { data: bomItems } = await db
    .from("bom")
    .select("*, insumos(unidad_medida)")
    .eq("producto_id", orden.producto_id);

  for (const item of bomItems || []) {
    const cantidadNecesaria = Number(item.cantidad_por_unidad) * cantidadBase;
    if (cantidadNecesaria <= 0) continue;

    if (item.insumo_id) {
      // El stock del insumo se controla en su unidad base (insumos.unidad_medida),
      // pero la fórmula pudo capturarse en otra unidad de la misma familia
      // (ej. gramos en vez de kilos) — hay que convertir antes de descontar.
      const unidadBaseInsumo = (item as any).insumos?.unidad_medida || item.unidad;
      const cantidadEnUnidadBase = convertirCantidad(cantidadNecesaria, item.unidad, unidadBaseInsumo);
      await descontarInsumo(db, item.insumo_id, orden.sucursal_id, cantidadEnUnidadBase, { reporteAvanceId: reporte?.id });
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
  const { error: errorEntradaStock } = await db.rpc("incrementar_stock_producto", {
    p_producto_id: orden.producto_id,
    p_sucursal_id: orden.sucursal_id,
    p_cantidad: Number(params.cantidadProducida),
  });
  if (errorEntradaStock) throw errorEntradaStock;

  const { error: errorMovimiento } = await db.from("movimientos").insert({
    tipo: "Entrada",
    origen_tipo: "Producto",
    producto_id: orden.producto_id,
    sucursal_id: orden.sucursal_id,
    cantidad: params.cantidadProducida,
    referencia: orden.folio,
    notas: `Reporte de avance · lote ${folioLote}`,
  });
  if (errorMovimiento) throw errorMovimiento;

  return { lote, reporte };
}
