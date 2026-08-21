import { NextResponse } from "next/server";
import { getSessionUser, getSucursalActualId } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/server";
import { obtenerConfigShopify, obtenerInventarioShopify } from "@/lib/shopify";

// Compara el inventario de Shopify (por SKU) contra el stock local de la
// sucursal actual. No modifica nada — solo regresa la comparación para que
// el usuario decida qué aplicar desde /dashboard/ventas/stock.
export async function POST() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ ok: false, mensaje: "Sesión no válida." }, { status: 401 });
  }

  const sucursalId = getSucursalActualId();
  if (!sucursalId) {
    return NextResponse.json(
      { ok: false, mensaje: "Elige una tienda arriba a la derecha antes de sincronizar." },
      { status: 400 }
    );
  }

  const config = await obtenerConfigShopify();
  if (!config?.dominio || !config?.access_token) {
    return NextResponse.json(
      { ok: false, mensaje: "Primero guarda el dominio y el access token de tu tienda Shopify." },
      { status: 400 }
    );
  }

  let variantesShopify;
  try {
    variantesShopify = await obtenerInventarioShopify(config.dominio, config.access_token);
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, mensaje: err?.message || "No se pudo conectar con Shopify." },
      { status: 502 }
    );
  }

  const db = supabaseAdmin();
  const { data: productos } = await db.from("productos").select("id, sku, nombre");
  const { data: stockRows } = await db
    .from("producto_stock")
    .select("producto_id, cantidad_disponible")
    .eq("sucursal_id", sucursalId);

  const stockLocalPorProducto: Record<string, number> = {};
  for (const row of stockRows || []) {
    stockLocalPorProducto[row.producto_id] = Number(row.cantidad_disponible);
  }
  const productoPorSku: Record<string, { id: string; nombre: string }> = {};
  for (const p of productos || []) {
    if (p.sku) productoPorSku[p.sku] = { id: p.id, nombre: p.nombre };
  }

  const comparacion = variantesShopify.map((v) => {
    const local = productoPorSku[v.sku];
    return {
      sku: v.sku,
      tituloShopify: v.tituloVariante && v.tituloVariante !== "Default Title" ? `${v.tituloProducto} — ${v.tituloVariante}` : v.tituloProducto,
      cantidadShopify: v.cantidadShopify,
      productoId: local?.id ?? null,
      nombreLocal: local?.nombre ?? null,
      cantidadLocal: local ? stockLocalPorProducto[local.id] ?? 0 : null,
    };
  });

  await db
    .from("shopify_config")
    .update({ ultima_sincronizacion: new Date().toISOString() })
    .eq("id", "default");

  return NextResponse.json({ ok: true, comparacion });
}
