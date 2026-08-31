import { randomBytes } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase/server";

export type ModoGeneracion = "sin_lote" | "lote_existente" | "lote_nuevo";
export type TipoFolio = "secuencial" | "universal";

export function validarConteoCodigosSolicitados(solicitados: number, generados: number) {
  const diferencia = generados - solicitados;

  if (diferencia === 0) {
    return { ok: true, estado: "correcto", diferencia: 0, mensaje: `Conteo correcto: ${generados} de ${solicitados}.` };
  }

  if (diferencia > 0) {
    return {
      ok: false,
      estado: "sobra",
      diferencia,
      mensaje: `Se generaron ${generados} etiquetas y se solicitaron ${solicitados}. Sobraron ${diferencia}.`,
    };
  }

  return {
    ok: false,
    estado: "falta",
    diferencia,
    mensaje: `Se generaron ${generados} etiquetas y se solicitaron ${solicitados}. Faltan ${Math.abs(diferencia)}.`,
  };
}

function generarFolioUniversal(sku?: string) {
  const prefijo = (sku || "PROD")
    .replace(/[^A-Za-z0-9]/g, "")
    .slice(0, 8)
    .toUpperCase() || "PROD";
  const token = randomBytes(3).toString("hex").slice(0, 6).toUpperCase();
  return `${prefijo}-${token}`;
}

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
  tipoFolio?: TipoFolio;
  // "Disponible" = ya está producido (se debe indicar a propósito).
  // "Pendiente" (default) = código impreso, aún no confirmado — lo confirma el escaneo.
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

  const tipoFolio = params.tipoFolio || "secuencial";

  const { data: generacion, error: errGen } = await db
    .from("generaciones_codigo_barra")
    .insert({
      producto_id: params.productoId,
      sucursal_id: params.sucursalId,
      lote_id: loteId,
      cantidad: params.cantidad,
      tipo_folio: tipoFolio,
      generado_por: params.generadoPor || null,
      meta_id: params.metaId || null,
      pedido_id: params.pedidoId || null,
    })
    .select()
    .single();
  if (errGen || !generacion) throw errGen || new Error("No se pudo crear la generación");

  // Por default, un código recién generado NO está producido todavía — solo
  // es una etiqueta lista para imprimir. Queda "Pendiente" hasta que se
  // escanea (ahí es cuando se descuentan insumos y sube el stock). Si algún
  // caso de verdad necesita marcarlo como ya producido, debe pasar
  // estadoInicial: "Disponible" explícitamente.
  const estadoInicial = params.estadoInicial || "Pendiente";

  // Aquí es donde puede tronar la generación si al producto le falta su
  // "contador de folio" (por ejemplo, si el producto se dio de alta por
  // fuera de la app — importación, SQL manual, seed). Antes de intentar
  // generar folios, nos aseguramos de que exista; si no, lo creamos solos
  // en vez de dejar que la función de la base de datos truene.
  const { data: contador } = await db
    .from("folio_contadores")
    .select("producto_id")
    .eq("producto_id", params.productoId)
    .maybeSingle();

  if (!contador) {
    const { data: producto } = await db.from("productos").select("sku").eq("id", params.productoId).single();
    const prefijo = (producto?.sku?.split("-")[0] || "PROD").toUpperCase();

    // Si el producto ya tenía piezas generadas antes (por ejemplo, migradas
    // a mano) partimos del número más alto que ya esté en uso, para no
    // repetir un folio existente.
    const { data: ultimaPieza } = await db
      .from("piezas")
      .select("folio_pieza")
      .eq("producto_id", params.productoId)
      .order("folio_pieza", { ascending: false })
      .limit(1)
      .maybeSingle();

    let ultimoNumero = 0;
    const match = ultimaPieza?.folio_pieza?.match(/(\d+)$/);
    if (match) ultimoNumero = parseInt(match[1], 10);

    await db.from("folio_contadores").insert({ producto_id: params.productoId, prefijo, ultimo_numero: ultimoNumero });
  }

  const piezas = [];
  const { data: producto } = await db.from("productos").select("sku").eq("id", params.productoId).single();

  for (let i = 0; i < params.cantidad; i++) {
    let folioGenerado: string;

    if (tipoFolio === "universal") {
      let candidato = generarFolioUniversal(producto?.sku);
      let intento = 0;
      while (intento < 20) {
        const { data: existente } = await db.from("piezas").select("id").eq("folio_pieza", candidato).maybeSingle();
        if (!existente) break;
        candidato = generarFolioUniversal(producto?.sku);
        intento += 1;
      }
      folioGenerado = candidato;
    } else {
      const { data: folioData, error: errFolio } = await db.rpc("siguiente_folio_producto", {
        p_producto_id: params.productoId,
      });
      if (errFolio) {
        throw new Error(
          `No se pudo generar el folio ${i + 1} de ${params.cantidad}: ${errFolio.message}`
        );
      }
      folioGenerado = folioData as string;
    }

    piezas.push({
      folio_pieza: folioGenerado,
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

  const conteoGenerado = await db.from("piezas").select("id", { count: "exact", head: true }).eq("generacion_id", generacion.id);
  const resultadoConteo = validarConteoCodigosSolicitados(params.cantidad, Number(conteoGenerado.count || 0));
  if (!resultadoConteo.ok) {
    throw new Error(resultadoConteo.mensaje);
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
  tipoFolio?: TipoFolio;
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
      tipoFolio: params.tipoFolio || "secuencial",
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
