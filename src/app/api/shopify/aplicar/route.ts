import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, getSucursalActualId } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/server";

// Aplica la cantidad de Shopify como nuevo stock local de un producto ya
// emparejado por SKU, en la sucursal actual. Deja rastro en "movimientos"
// como cualquier otro ajuste.
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ ok: false, mensaje: "Sesión no válida." }, { status: 401 });
  }

  const sucursalId = getSucursalActualId();
  if (!sucursalId) {
    return NextResponse.json({ ok: false, mensaje: "Elige una tienda antes de aplicar el ajuste." }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const productoId = body.productoId as string;
  const cantidadShopify = Number(body.cantidadShopify);

  if (!productoId || Number.isNaN(cantidadShopify)) {
    return NextResponse.json({ ok: false, mensaje: "Datos incompletos." }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { data: stockRow } = await db
    .from("producto_stock")
    .select("*")
    .eq("producto_id", productoId)
    .eq("sucursal_id", sucursalId)
    .maybeSingle();

  const anterior = Number(stockRow?.cantidad_disponible || 0);
  const diferencia = cantidadShopify - anterior;

  if (stockRow) {
    await db.from("producto_stock").update({ cantidad_disponible: cantidadShopify }).eq("id", stockRow.id);
  } else {
    await db.from("producto_stock").insert({
      producto_id: productoId,
      sucursal_id: sucursalId,
      cantidad_disponible: cantidadShopify,
      stock_minimo: 0,
    });
  }

  if (diferencia !== 0) {
    await db.from("movimientos").insert({
      tipo: diferencia > 0 ? "Entrada" : "Salida",
      origen_tipo: "Producto",
      producto_id: productoId,
      sucursal_id: sucursalId,
      cantidad: Math.abs(diferencia),
      referencia: "Sincronización Shopify",
      usuario_id: user.id,
      notas: `Ajuste de stock local a partir del inventario de Shopify (${anterior} → ${cantidadShopify}).`,
    });
  }

  return NextResponse.json({ ok: true, nuevaCantidad: cantidadShopify });
}
