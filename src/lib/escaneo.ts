import { supabaseAdmin } from "@/lib/supabase/server";
import { descontarInsumo } from "@/lib/insumo-consumo";
import { convertirCantidad } from "@/lib/unidades";

export type ResultadoEscaneo =
  | { ok: true; folio: string; productoId: string; productoNombre: string; productoSku: string }
  | { ok: false; folio: string; mensaje: string };

/**
 * Confirma una pieza como producida a partir de su folio (leído por cámara o
 * por un escáner Bluetooth, que se comporta como teclado).
 *
 * Efectos, en una sola operación:
 *  1. Descuenta la materia prima que pide la fórmula (BOM), x1 — con FEFO
 *     si el insumo controla caducidad.
 *  2. Suma 1 al stock de producto terminado de la sucursal.
 *  3. Marca la pieza como "Disponible" (queda fuera del estado "Pendiente").
 *  4. Si la pieza viene de una meta de producción, su avance sube solo,
 *     porque el % se calcula contando piezas "Disponible" de esa meta.
 */
export async function confirmarPiezaPorFolio(
  folioPieza: string,
  sucursalId: string,
  usuarioId?: string
): Promise<ResultadoEscaneo> {
  const db = supabaseAdmin();
  const folio = folioPieza.trim();

  const { data: pieza } = await db
    .from("piezas")
    .select("*, productos(nombre, sku)")
    .eq("folio_pieza", folio)
    .maybeSingle();

  if (!pieza) {
    return { ok: false, folio, mensaje: "No existe ninguna pieza con ese folio." };
  }
  if (pieza.sucursal_id !== sucursalId) {
    return { ok: false, folio, mensaje: "Esta pieza pertenece a otra sucursal." };
  }
  if (pieza.estado === "Disponible") {
    return { ok: false, folio, mensaje: "Esta pieza ya estaba registrada en el inventario." };
  }
  if (pieza.estado !== "Pendiente") {
    return { ok: false, folio, mensaje: `Esta pieza está marcada como "${pieza.estado}" y no se puede agregar.` };
  }

  // 1. Descuento de insumos según BOM (x1 unidad de producto)
  const { data: bomItems } = await db
    .from("bom")
    .select("*, insumos(unidad_medida)")
    .eq("producto_id", pieza.producto_id);
  for (const item of bomItems || []) {
    const cantidadNecesaria = Number(item.cantidad_por_unidad);
    if (cantidadNecesaria <= 0) continue;

    if (item.insumo_id) {
      // El stock del insumo se controla en su unidad base, pero la fórmula
      // pudo capturarse en otra unidad de la misma familia (ej. gramos en
      // vez de kilos) — se convierte antes de descontar.
      const unidadBaseInsumo = (item as any).insumos?.unidad_medida || item.unidad;
      const cantidadEnUnidadBase = convertirCantidad(cantidadNecesaria, item.unidad, unidadBaseInsumo);
      await descontarInsumo(db, item.insumo_id, sucursalId, cantidadEnUnidadBase, { piezaId: pieza.id });
    } else if (item.insumo_producto_id) {
      const { data: stockRow } = await db
        .from("producto_stock")
        .select("*")
        .eq("producto_id", item.insumo_producto_id)
        .eq("sucursal_id", sucursalId)
        .maybeSingle();
      if (stockRow) {
        await db
          .from("producto_stock")
          .update({ cantidad_disponible: Number(stockRow.cantidad_disponible) - cantidadNecesaria })
          .eq("id", stockRow.id);
      }
      await db.from("reporte_consumo_insumos").insert({
        pieza_id: pieza.id,
        insumo_producto_id: item.insumo_producto_id,
        cantidad_consumida: cantidadNecesaria,
      });
    }
  }

  // 2. Suma 1 al stock de producto terminado
  const { data: prodStock } = await db
    .from("producto_stock")
    .select("*")
    .eq("producto_id", pieza.producto_id)
    .eq("sucursal_id", sucursalId)
    .maybeSingle();

  if (prodStock) {
    await db
      .from("producto_stock")
      .update({ cantidad_disponible: Number(prodStock.cantidad_disponible) + 1 })
      .eq("id", prodStock.id);
  } else {
    await db.from("producto_stock").insert({
      producto_id: pieza.producto_id,
      sucursal_id: sucursalId,
      cantidad_disponible: 1,
      stock_minimo: 0,
    });
  }

  // 3. Confirma la pieza
  await db
    .from("piezas")
    .update({
      estado: "Disponible",
      escaneada_en: new Date().toISOString(),
      escaneada_por: usuarioId || null,
    })
    .eq("id", pieza.id);

  await db.from("movimientos").insert({
    tipo: "Entrada",
    origen_tipo: "Producto",
    producto_id: pieza.producto_id,
    sucursal_id: sucursalId,
    cantidad: 1,
    referencia: folio,
    notas: "Alta por escaneo de código de barra",
  });

  return {
    ok: true,
    folio,
    productoId: pieza.producto_id,
    productoNombre: (pieza.productos as any)?.nombre || "Producto",
    productoSku: (pieza.productos as any)?.sku || "",
  };
}
