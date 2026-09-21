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

export function normalizarCantidadAjuste(actual: number, objetivo: number) {
  const cantidadActual = Number(actual) || 0;
  const cantidadObjetivo = Number(objetivo) || 0;

  if (cantidadObjetivo <= 0) {
    return {
      accion: "eliminar",
      diferencia: Math.max(cantidadActual, 0),
      nuevaCantidad: 0,
      cantidadActual,
      cantidadObjetivo,
    };
  }

  if (cantidadObjetivo < cantidadActual) {
    return {
      accion: "reducir",
      diferencia: cantidadActual - cantidadObjetivo,
      nuevaCantidad: cantidadObjetivo,
      cantidadActual,
      cantidadObjetivo,
    };
  }

  if (cantidadObjetivo > cantidadActual) {
    return {
      accion: "agregar",
      diferencia: cantidadObjetivo - cantidadActual,
      nuevaCantidad: cantidadObjetivo,
      cantidadActual,
      cantidadObjetivo,
    };
  }

  return {
    accion: "sin_cambios",
    diferencia: 0,
    nuevaCantidad: cantidadObjetivo,
    cantidadActual,
    cantidadObjetivo,
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

  const basePayload = {
    producto_id: params.productoId,
    sucursal_id: params.sucursalId,
    lote_id: loteId,
    cantidad: params.cantidad,
    generado_por: params.generadoPor || null,
    meta_id: params.metaId || null,
    pedido_id: params.pedidoId || null,
  };

  let generacion;
  let errGen;

  try {
    ({ data: generacion, error: errGen } = await db
      .from("generaciones_codigo_barra")
      .insert({
        ...basePayload,
        tipo_folio: tipoFolio,
      })
      .select()
      .single());
  } catch (error: any) {
    errGen = error;
  }

  const mensajeEsquema = `${errGen?.message ?? ""} ${errGen?.details ?? ""}`;
  if (errGen && mensajeEsquema.includes("tipo_folio")) {
    ({ data: generacion, error: errGen } = await db
      .from("generaciones_codigo_barra")
      .insert(basePayload)
      .select()
      .single());
  }

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
    // a mano) partimos del número siguiente al más alto que ya esté en uso,
    // para no repetir un folio existente.
    const { data: ultimaPieza } = await db
      .from("piezas")
      .select("folio_pieza")
      .eq("producto_id", params.productoId)
      .order("folio_pieza", { ascending: false })
      .limit(1)
      .maybeSingle();

    let ultimoNumero = 0;
    const match = ultimaPieza?.folio_pieza?.match(/(\d+)$/);
    if (match) ultimoNumero = parseInt(match[1], 10) + 1;

    await db.from("folio_contadores").insert({ producto_id: params.productoId, prefijo, ultimo_numero: ultimoNumero });
  }

  const piezas = [];
  const { data: producto } = await db.from("productos").select("sku").eq("id", params.productoId).single();

  let folioUnicoPorProducto: string | null = null;

  if (tipoFolio === "universal") {
    let candidato = generarFolioUniversal(producto?.sku);
    let intento = 0;
    while (intento < 20) {
      const { data: existente } = await db.from("piezas").select("id").eq("folio_pieza", candidato).maybeSingle();
      if (!existente) break;
      candidato = generarFolioUniversal(producto?.sku);
      intento += 1;
    }
    folioUnicoPorProducto = candidato;
  }

  for (let i = 0; i < params.cantidad; i++) {
    let folioGenerado: string;

    if (tipoFolio === "universal") {
      folioGenerado = folioUnicoPorProducto!;
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

async function sincronizarContadorProducto(productoId: string) {
  const db = supabaseAdmin();
  const { data: piezas, error: errorPiezas } = await db
    .from("piezas")
    .select("folio_pieza")
    .eq("producto_id", productoId);

  if (errorPiezas) throw errorPiezas;

  const mayorNumero = (piezas || []).reduce((mayor, pieza) => {
    const numero = Number(pieza.folio_pieza.match(/(\d+)$/)?.[1]);
    return Number.isFinite(numero) ? Math.max(mayor, numero) : mayor;
  }, -1);

  const { error: errorContador } = await db
    .from("folio_contadores")
    .update({ ultimo_numero: mayorNumero + 1 })
    .eq("producto_id", productoId);

  if (errorContador) throw errorContador;
}

// Elimina una tanda de códigos de barra y todo su historial asociado, útil
// cuando se imprimió una cantidad equivocada y hay que limpiar la tanda.
export async function eliminarGeneracionCodigoBarra(generacionId: string) {
  const db = supabaseAdmin();

  const { data: generacion, error: errorGeneracion } = await db
    .from("generaciones_codigo_barra")
    .select("id, pedido_id, producto_id")
    .eq("id", generacionId)
    .single();

  if (errorGeneracion) throw errorGeneracion;
  if (!generacion) return;

  const { data: piezas } = await db
    .from("piezas")
    .select("id")
    .eq("generacion_id", generacionId);

  const piezaIds = (piezas || []).map((pieza) => pieza.id);

  if (piezaIds.length) {
    const { error: errorReimpresiones } = await db.from("reimpresiones_etiqueta").delete().in("pieza_id", piezaIds);
    if (errorReimpresiones) throw errorReimpresiones;

    const { error: errorPiezas } = await db.from("piezas").delete().in("id", piezaIds);
    if (errorPiezas) throw errorPiezas;
  }

  const { error: errorDeleteGeneracion } = await db.from("generaciones_codigo_barra").delete().eq("id", generacionId);
  if (errorDeleteGeneracion) throw errorDeleteGeneracion;

  if (generacion.pedido_id) {
    const { data: restantes } = await db
      .from("generaciones_codigo_barra")
      .select("id")
      .eq("pedido_id", generacion.pedido_id)
      .limit(1);

    if (!restantes || restantes.length === 0) {
      const { error: errorPedido } = await db.from("pedidos_impresion").delete().eq("id", generacion.pedido_id);
      if (errorPedido) throw errorPedido;
    }
  }

  await sincronizarContadorProducto(generacion.producto_id);
}

export async function ajustarCantidadGeneracionCodigoBarra(generacionId: string, nuevaCantidad: number) {
  const db = supabaseAdmin();
  const cantidadObjetivo = Number(nuevaCantidad) || 0;

  if (cantidadObjetivo < 0) {
    throw new Error("La cantidad nueva no puede ser negativa.");
  }

  const { data: generacion, error: errorGeneracion } = await db
    .from("generaciones_codigo_barra")
    .select("id, cantidad, pedido_id, producto_id, sucursal_id, lote_id")
    .eq("id", generacionId)
    .single();

  if (errorGeneracion || !generacion) {
    throw errorGeneracion || new Error("No se encontró la tanda para ajustar.");
  }

  const { accion, diferencia } = normalizarCantidadAjuste(Number(generacion.cantidad || 0), cantidadObjetivo);

  if (accion === "sin_cambios") {
    return { generacionId, accion, diferencia, nuevaCantidad: cantidadObjetivo, mensaje: "No hubo cambios." };
  }

  if (accion === "eliminar") {
    await eliminarGeneracionCodigoBarra(generacionId);
    return {
      generacionId,
      accion: "eliminar",
      diferencia,
      nuevaCantidad: 0,
      mensaje: `Se eliminó la tanda completa porque quedaba en 0 etiquetas.`,
    };
  }

  if (accion === "reducir") {
    const { data: piezas } = await db
      .from("piezas")
      .select("id")
      .eq("generacion_id", generacionId)
      .order("created_at", { ascending: false })
      .limit(diferencia);

    const piezaIds = (piezas || []).map((pieza) => pieza.id);

    if (piezaIds.length) {
      const { error: errorReimpresiones } = await db.from("reimpresiones_etiqueta").delete().in("pieza_id", piezaIds);
      if (errorReimpresiones) throw errorReimpresiones;

      const { error: errorPiezas } = await db.from("piezas").delete().in("id", piezaIds);
      if (errorPiezas) throw errorPiezas;
    }

    const { error: errorCantidad } = await db
      .from("generaciones_codigo_barra")
      .update({ cantidad: cantidadObjetivo })
      .eq("id", generacionId);

    if (errorCantidad) throw errorCantidad;

    await sincronizarContadorProducto(generacion.producto_id);

    return {
      generacionId,
      accion: "reducir",
      diferencia,
      nuevaCantidad: cantidadObjetivo,
      mensaje: `Se redujo la tanda de ${Number(generacion.cantidad || 0)} a ${cantidadObjetivo}.`,
    };
  }

  const { data: ultimaPieza } = await db
    .from("piezas")
    .select("folio_pieza")
    .eq("generacion_id", generacionId)
    .order("folio_pieza", { ascending: false })
    .limit(1)
    .maybeSingle();

  const ultimoNumero = ultimaPieza?.folio_pieza?.match(/(\d+)$/)?.[1] ? Number(ultimaPieza.folio_pieza.match(/(\d+)$/)?.[1]) : 0;

  const piezas = [] as Array<{ folio_pieza: string; lote_id: string | null; producto_id: string; sucursal_id: string; estado: string; generacion_id: string; meta_id: string | null }>;
  for (let i = 0; i < diferencia; i++) {
    const siguienteFolio = await db.rpc("siguiente_folio_producto", { p_producto_id: generacion.producto_id });
    const folioGenerado = String(siguienteFolio.data || `${ultimoNumero + i + 1}`);
    piezas.push({
      folio_pieza: folioGenerado,
      lote_id: generacion.lote_id || null,
      producto_id: generacion.producto_id,
      sucursal_id: generacion.sucursal_id,
      estado: "Pendiente",
      generacion_id: generacionId,
      meta_id: null,
    });
  }

  if (piezas.length) {
    const { error: errorPiezas } = await db.from("piezas").insert(piezas);
    if (errorPiezas) throw errorPiezas;
  }

  const { error: errorCantidad } = await db
    .from("generaciones_codigo_barra")
    .update({ cantidad: cantidadObjetivo })
    .eq("id", generacionId);

  if (errorCantidad) throw errorCantidad;

  await sincronizarContadorProducto(generacion.producto_id);

  return {
    generacionId,
    accion: "agregar",
    diferencia,
    nuevaCantidad: cantidadObjetivo,
    mensaje: `Se agregaron ${diferencia} etiquetas más a la tanda.`,
  };
}

export async function eliminarPiezasGeneracionPorCantidad(generacionId: string, cantidadAEliminar: number) {
  const db = supabaseAdmin();
  const cantidad = Number(cantidadAEliminar) || 0;

  if (cantidad <= 0) {
    throw new Error("Debes indicar al menos 1 etiqueta para eliminar.");
  }

  const { data: generacion, error: errorGeneracion } = await db
    .from("generaciones_codigo_barra")
    .select("id, cantidad, producto_id")
    .eq("id", generacionId)
    .single();

  if (errorGeneracion || !generacion) {
    throw errorGeneracion || new Error("No se encontró la tanda para eliminar etiquetas.");
  }

  const totalActual = Number(generacion.cantidad || 0);
  if (cantidad >= totalActual) {
    await eliminarGeneracionCodigoBarra(generacionId);
    return {
      generacionId,
      accion: "eliminar_tanda",
      eliminadas: totalActual,
      restante: 0,
      mensaje: `Se eliminó toda la tanda (${totalActual} etiquetas).`,
    };
  }

  const { data: piezas } = await db
    .from("piezas")
    .select("id")
    .eq("generacion_id", generacionId)
    .order("created_at", { ascending: false })
    .limit(cantidad);

  const piezaIds = (piezas || []).map((pieza) => pieza.id);

  if (piezaIds.length) {
    const { error: errorReimpresiones } = await db.from("reimpresiones_etiqueta").delete().in("pieza_id", piezaIds);
    if (errorReimpresiones) throw errorReimpresiones;

    const { error: errorPiezas } = await db.from("piezas").delete().in("id", piezaIds);
    if (errorPiezas) throw errorPiezas;
  }

  const nuevaCantidad = totalActual - cantidad;
  const { error: errorCantidad } = await db
    .from("generaciones_codigo_barra")
    .update({ cantidad: nuevaCantidad })
    .eq("id", generacionId);

  if (errorCantidad) throw errorCantidad;

  await sincronizarContadorProducto(generacion.producto_id);

  return {
    generacionId,
    accion: "eliminar_parcial",
    eliminadas: cantidad,
    restante: nuevaCantidad,
    mensaje: `Se eliminaron ${cantidad} etiquetas; quedan ${nuevaCantidad}.`,
  };
}

export async function registrarGeneracionInsumo(params: {
  insumoId: string;
  cantidad: number;
  tipoFolio?: "secuencial" | "universal";
}) {
  const db = supabaseAdmin();
  const cantidadTotal = Math.max(0, Math.round(Number(params.cantidad) || 0));

  if (!params.insumoId) {
    throw new Error("Falta el insumo para registrar la generación.");
  }

  if (cantidadTotal <= 0) {
    throw new Error("La cantidad de códigos para registrar debe ser mayor a 0.");
  }

  const { data, error } = await db
    .from("insumo_codigo_barra_generaciones")
    .insert({
      insumo_id: params.insumoId,
      cantidad: cantidadTotal,
      tipo_folio: params.tipoFolio === "universal" ? "universal" : "secuencial",
    })
    .select()
    .single();

  if (error || !data) throw error || new Error("No se pudo guardar la generación de etiquetas del insumo.");
  return data.id as string;
}

export async function ajustarCantidadGeneracionInsumo(generacionId: string, nuevaCantidad: number) {
  const db = supabaseAdmin();
  const cantidadObjetivo = Math.max(0, Math.round(Number(nuevaCantidad) || 0));

  const { data: generacion, error: errorGeneracion } = await db
    .from("insumo_codigo_barra_generaciones")
    .select("id, cantidad")
    .eq("id", generacionId)
    .single();

  if (errorGeneracion || !generacion) {
    throw errorGeneracion || new Error("No se encontró la tanda de insumos para ajustar.");
  }

  const { accion, diferencia } = normalizarCantidadAjuste(Number(generacion.cantidad || 0), cantidadObjetivo);

  if (accion === "sin_cambios") {
    return { generacionId, accion, diferencia, nuevaCantidad: cantidadObjetivo, mensaje: "No hubo cambios." };
  }

  if (accion === "eliminar") {
    await eliminarGeneracionInsumo(generacionId);
    return {
      generacionId,
      accion: "eliminar",
      diferencia,
      nuevaCantidad: 0,
      mensaje: "Se eliminó la tanda completa porque quedó en 0 etiquetas.",
    };
  }

  const { error: errorCantidad } = await db
    .from("insumo_codigo_barra_generaciones")
    .update({ cantidad: cantidadObjetivo })
    .eq("id", generacionId);

  if (errorCantidad) throw errorCantidad;

  return {
    generacionId,
    accion: accion === "reducir" ? "reducir" : "agregar",
    diferencia,
    nuevaCantidad: cantidadObjetivo,
    mensaje:
      accion === "reducir"
        ? `Se redujo la tanda de ${Number(generacion.cantidad || 0)} a ${cantidadObjetivo}.`
        : `Se agregaron ${diferencia} etiquetas más a la tanda.`,
  };
}

export async function eliminarGeneracionInsumo(generacionId: string) {
  const db = supabaseAdmin();
  const { error } = await db.from("insumo_codigo_barra_generaciones").delete().eq("id", generacionId);
  if (error) throw error;
}
