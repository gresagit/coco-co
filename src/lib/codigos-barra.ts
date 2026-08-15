import { supabaseAdmin } from "@/lib/supabase/server";

export type ModoGeneracion = "sin_lote" | "lote_existente" | "lote_nuevo";

// Genera N folios de pieza (código de barras) para un producto, sin
// necesidad de una orden de producción cerrada. Soporta tres modos:
// - sin_lote: folios "sueltos", solo ligados al producto y la sucursal.
// - lote_existente: folios ligados a un lote ya creado (por ejemplo, uno
//   generado por un reporte de avance de producción).
// - lote_nuevo: crea un lote "manual" (sin orden de producción) para
//   agrupar esta tanda, útil para pre-imprimir antes de producir.
export async function generarTandaCodigosBarra(params: {
  productoId: string;
  sucursalId: string;
  cantidad: number;
  porcentajeRepuesto: number;
  modo: ModoGeneracion;
  loteId?: string;
  folioLoteNuevo?: string;
  generadoPor?: string;
  metaId?: string;
  // "Disponible" = ya está producido (flujo manual de hoy).
  // "Pendiente" = código impreso, aún no confirmado — lo confirma el escaneo.
  estadoInicial?: "Disponible" | "Pendiente";
}) {
  const db = supabaseAdmin();

  let loteId: string | null = null;

  if (params.modo === "lote_existente") {
    if (!params.loteId) throw new Error("Falta seleccionar el lote existente");
    loteId = params.loteId;
  } else if (params.modo === "lote_nuevo") {
    const { data: producto } = await db.from("productos").select("sku").eq("id", params.productoId).single();
    const folio =
      params.folioLoteNuevo?.trim() ||
      `${(producto?.sku || "PROD").split("-")[0].toUpperCase()}-MANUAL-${Date.now().toString().slice(-6)}`;

    const { data: lote, error } = await db
      .from("lotes")
      .insert({
        folio_lote: folio,
        orden_produccion_id: null,
        producto_id: params.productoId,
        sucursal_id: params.sucursalId,
        cantidad_total: params.cantidad,
      })
      .select()
      .single();
    if (error) throw error;
    loteId = lote.id;
  }
  // modo "sin_lote": loteId queda null

  const { data: generacion, error: errGen } = await db
    .from("generaciones_codigo_barra")
    .insert({
      producto_id: params.productoId,
      sucursal_id: params.sucursalId,
      lote_id: loteId,
      cantidad: params.cantidad,
      porcentaje_repuesto: params.porcentajeRepuesto,
      generado_por: params.generadoPor || null,
      meta_id: params.metaId || null,
    })
    .select()
    .single();
  if (errGen || !generacion) throw errGen || new Error("No se pudo crear la generación");

  const estadoInicial = params.estadoInicial || "Disponible";

  const piezas = [];
  for (let i = 0; i < params.cantidad; i++) {
    const { data: folioData, error: errFolio } = await db.rpc("siguiente_folio_producto", {
      p_producto_id: params.productoId,
    });
    if (errFolio) throw errFolio;
    piezas.push({
      folio_pieza: folioData as string,
      lote_id: loteId,
      producto_id: params.productoId,
      sucursal_id: params.sucursalId,
      estado: estadoInicial,
      generacion_id: generacion.id,
      meta_id: params.metaId || null,
    });
  }

  if (piezas.length) {
    const { error: errPiezas } = await db.from("piezas").insert(piezas);
    if (errPiezas) throw errPiezas;
  }

  return generacion.id as string;
}
