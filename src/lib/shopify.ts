import { supabaseAdmin } from "@/lib/supabase/server";

export type ShopifyConfig = {
  dominio: string | null;
  access_token: string | null;
  ultima_sincronizacion: string | null;
};

export type ShopifyVariante = {
  sku: string;
  tituloProducto: string;
  tituloVariante: string;
  cantidadShopify: number;
};

export async function obtenerConfigShopify(): Promise<ShopifyConfig | null> {
  const db = supabaseAdmin();
  const { data } = await db.from("shopify_config").select("*").eq("id", "default").maybeSingle();
  if (!data) return null;
  return {
    dominio: data.dominio,
    access_token: data.access_token,
    ultima_sincronizacion: data.ultima_sincronizacion,
  };
}

/**
 * Trae inventario de todas las variantes (con SKU) desde la Admin API REST
 * de Shopify. Requiere una app custom con acceso de lectura a productos.
 * Documentación: https://shopify.dev/docs/api/admin-rest/latest/resources/product
 */
export async function obtenerInventarioShopify(dominio: string, accessToken: string): Promise<ShopifyVariante[]> {
  const limpio = dominio.trim().replace(/^https?:\/\//, "").replace(/\/$/, "");
  const variantes: ShopifyVariante[] = [];
  let url: string | null =
    `https://${limpio}/admin/api/2024-01/products.json?limit=250&fields=id,title,variants`;

  // Shopify pagina con un header Link estilo "rel=next" — seguimos hasta
  // agotar páginas o llegar a un tope razonable de seguridad.
  let paginas = 0;
  while (url && paginas < 20) {
    const res: Response = await fetch(url, {
      headers: {
        "X-Shopify-Access-Token": accessToken,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });

    if (!res.ok) {
      const texto = await res.text().catch(() => "");
      throw new Error(`Shopify respondió ${res.status}: ${texto || res.statusText}`);
    }

    const data = await res.json();
    for (const producto of data.products || []) {
      for (const variante of producto.variants || []) {
        if (!variante.sku) continue;
        variantes.push({
          sku: String(variante.sku).trim(),
          tituloProducto: producto.title,
          tituloVariante: variante.title,
          cantidadShopify: Number(variante.inventory_quantity ?? 0),
        });
      }
    }

    const link: string | null = res.headers.get("link") || res.headers.get("Link");
    const siguiente: string | undefined = link?.split(",").find((p: string) => p.includes('rel="next"'));
    const match: RegExpMatchArray | null | undefined = siguiente?.match(/<([^>]+)>/);
    url = match ? match[1] : null;
    paginas++;
  }

  return variantes;
}
