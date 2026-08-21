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
  modo: ModoGeneracion;
  loteId?: string;
  folioLoteNuevo?: string;
  generadoPor?: string;
  metaId?: string;
  pedidoId?: string;
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
      generado_por: params.generadoPor || null,
      meta_id: params.metaId || null,
      pedido_id: params.pedidoId || null,
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

// Crea un "pedido de impresión" que agrupa varias tandas (una por producto)
// generadas en la misma pasada, para poder descargarlas juntas.
export async function crearPedidoImpresion(params: { sucursalId: string; generadoPor?: string }) {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("pedidos_impresion")
    .insert({ sucursal_id: params.sucursalId, generado_por: params.generadoPor || null })
    .select()
    .single();
  if (error || !data) throw error || new Error("No se pudo crear el pedido de impresión");
  return data.id as string;
}

// Genera de un jalón los códigos de barra de varios productos, cada uno con
// su propia cantidad, agrupados bajo un mismo pedido de impresión. Siempre
// en modo "sin_lote" (folios sueltos) — si algún producto necesita quedar
// ligado a un lote específico, se genera aparte desde el flujo de un solo
// producto.
export async function generarPedidoMultiProducto(params: {
  sucursalId: string;
  items: { productoId: string; cantidad: number }[];
  generadoPor?: string;
}) {
  const itemsValidos = params.items.filter((i) => i.productoId && i.cantidad > 0);
  if (!itemsValidos.length) throw new Error("Agrega al menos un producto con cantidad mayor a 0");

  const pedidoId = await crearPedidoImpresion({ sucursalId: params.sucursalId, generadoPor: params.generadoPor });

  const generacionIds: string[] = [];
  for (const item of itemsValidos) {
    const generacionId = await generarTandaCodigosBarra({
      productoId: item.productoId,
      sucursalId: params.sucursalId,
      cantidad: item.cantidad,
      modo: "sin_lote",
      generadoPor: params.generadoPor,
      pedidoId,
    });
    generacionIds.push(generacionId);
  }

  return { pedidoId, generacionIds };
}

// Registra el reemplazo de etiquetas puntuales que se dañaron (una, varias
// sueltas, o un rango). Mantiene el MISMO folio de cada pieza — no crea
// códigos nuevos — porque el folio ya identifica a esa pieza física en el
// inventario; solo queda constancia de que se volvió a imprimir y por qué.
export async function registrarReemplazos(params: {
  piezaIds: string[];
  motivo?: string;
  reimpresoPor?: string;
}) {
  const db = supabaseAdmin();
  if (!params.piezaIds.length) return;

  const filas = params.piezaIds.map((piezaId) => ({
    pieza_id: piezaId,
    motivo: params.motivo || "Etiqueta dañada",
    reimpreso_por: params.reimpresoPor || null,
  }));

  const { error } = await db.from("reimpresiones_etiqueta").insert(filas);
  if (error) throw error;
}
