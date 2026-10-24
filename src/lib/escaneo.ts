import { supabaseAdmin } from "@/lib/supabase/server";
import { convertirCantidad } from "@/lib/unidades";

export type ResultadoEscaneo =
  | { ok: true; folio: string; productoId: string; productoNombre: string; productoSku: string }
  | { ok: false; folio: string; mensaje: string };

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
  if (errorPieza) throw errorPieza;
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
  if (errorBom) throw errorBom;

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
  if (error) throw error;

  return {
    ok: true,
    folio,
    productoId: data.productoId,
    productoNombre: data.productoNombre || "Producto",
    productoSku: data.productoSku || "",
  };
}
