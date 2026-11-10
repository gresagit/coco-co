import { supabaseAdmin } from "@/lib/supabase/server";
import { convertirCantidad } from "@/lib/unidades";

type ErrorEscaneo = Error & { code?: string; details?: string; hint?: string };

export function extraerMensajeError(error: unknown, fallback = "Ocurrió un error inesperado.") {
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    const mensaje = typeof record.message === "string" ? record.message : "";

    if (record.code === "PGRST202" || /could not find the function/i.test(mensaje)) {
      return "Falta aplicar la migración 031/033 en Supabase.";
    }
    if (record.code === "23505") {
      return "Ya existe un registro con ese identificador o folio.";
    }
    if (mensaje.trim()) return mensaje;

    const detalle = [record.details, record.hint]
      .filter((valor) => typeof valor === "string" && valor.trim())
      .join(" ");
    if (detalle) return detalle;

    const nestedError = record.error as Record<string, unknown> | undefined;
    if (typeof nestedError?.message === "string" && nestedError.message.trim()) return nestedError.message;
  } else if (typeof error === "string" && error.trim()) {
    return error;
  }

  return fallback;
}

export function crearErrorLegible(error: unknown, fallback = "Ocurrió un error inesperado.") {
  const normalizado = new Error(extraerMensajeError(error, fallback)) as ErrorEscaneo;
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    if (typeof record.code === "string") normalizado.code = record.code;
    if (typeof record.details === "string") normalizado.details = record.details;
    if (typeof record.hint === "string") normalizado.hint = record.hint;
  }
  return normalizado;
}

export type ResultadoEscaneo =
  | { ok: true; folio: string; productoId: string; productoNombre: string; productoSku: string }
  | { ok: false; folio: string; mensaje: string };

export type ResultadoEnvio = {
  ok: true;
  folio: string;
  productoId: string;
  productoNombre: string;
  productoSku: string;
  pedidoExternoId: string | null;
  pedidoCompletado: boolean;
};

/**
 * Confirma una pieza y aplica el consumo de su fórmula dentro de una única
 * transacción para no dejar stock, consumos y estado de folio desincronizados.
 */
export async function confirmarPiezaPorFolio(
  folioPieza: string,
  sucursalId: string,
  usuarioId?: string
): Promise<ResultadoEscaneo> {
  const db = supabaseAdmin();
  const folio = folioPieza.trim();

  const { data: pieza, error: errorPieza } = await db
    .from("piezas")
    .select("producto_id, sucursal_id, estado")
    .eq("folio_pieza", folio)
    .maybeSingle();

  if (errorPieza) throw crearErrorLegible(errorPieza, "No se pudo buscar la pieza.");
  if (!pieza) return { ok: false, folio, mensaje: "No existe ninguna pieza con ese folio." };
  if (pieza.sucursal_id !== sucursalId) {
    return { ok: false, folio, mensaje: "Esta pieza pertenece a otra sucursal." };
  }
  if (pieza.estado !== "Pendiente") {
    if (pieza.estado === "Disponible") {
      return { ok: false, folio, mensaje: "Esta pieza ya está registrada en el inventario; no se volvió a sumar." };
    }
    return { ok: false, folio, mensaje: `Esta pieza está marcada como "${pieza.estado}" y no se puede agregar.` };
  }

  const { data: bomItems, error: errorBom } = await db
    .from("bom")
    .select("*, insumos(unidad_medida)")
    .eq("producto_id", pieza.producto_id);
  if (errorBom) throw crearErrorLegible(errorBom, "No se pudo cargar la fórmula del producto.");

  const consumos: Array<{ tipo: "insumo" | "producto"; id: string; cantidad: number }> = [];
  for (const item of bomItems || []) {
    const cantidadNecesaria = Number(item.cantidad_por_unidad);
    if (!Number.isFinite(cantidadNecesaria) || cantidadNecesaria < 0) {
      throw new Error("La fórmula contiene una cantidad de consumo inválida.");
    }
    if (cantidadNecesaria === 0) continue;

    if (item.insumo_id) {
      const unidadBaseInsumo = (item as any).insumos?.unidad_medida || item.unidad;
      consumos.push({
        tipo: "insumo",
        id: item.insumo_id,
        cantidad: convertirCantidad(cantidadNecesaria, item.unidad, unidadBaseInsumo),
      });
    } else if (item.insumo_producto_id) {
      consumos.push({ tipo: "producto", id: item.insumo_producto_id, cantidad: cantidadNecesaria });
    }
  }

  const { data, error } = await db.rpc("confirmar_pieza_escaneada", {
    p_folio: folio,
    p_sucursal_id: sucursalId,
    p_usuario_id: usuarioId || null,
    p_consumos: consumos,
  });
  if (error) throw crearErrorLegible(error, "No se pudo confirmar la pieza escaneada.");

  return {
    ok: true,
    folio,
    productoId: data.productoId,
    productoNombre: data.productoNombre || "Producto",
    productoSku: data.productoSku || "",
  };
}

export async function enviarPiezaPorFolio(
  folioPieza: string,
  sucursalId: string,
  usuarioId: string,
  pedidoId: string | null
): Promise<ResultadoEnvio> {
  const { data, error } = await supabaseAdmin().rpc("enviar_pieza_escaneada", {
    p_folio: folioPieza.trim(),
    p_sucursal_id: sucursalId,
    p_usuario_id: usuarioId,
    p_pedido_id: pedidoId,
  });
  if (error) throw crearErrorLegible(error, "No se pudo registrar la salida de la pieza.");

  return {
    ok: true,
    folio: data.folio,
    productoId: data.productoId,
    productoNombre: data.productoNombre || "Producto",
    productoSku: data.productoSku || "",
    pedidoExternoId: data.pedidoExternoId || null,
    pedidoCompletado: data.pedidoCompletado === true,
  };
}
