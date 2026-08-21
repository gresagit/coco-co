import { supabaseAdmin } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import ShopifyStockSync from "@/components/ShopifyStockSync";

async function guardarConfig(formData: FormData) {
  "use server";
  const db = supabaseAdmin();
  const dominio = (formData.get("dominio") as string)?.trim().replace(/^https?:\/\//, "").replace(/\/$/, "");
  const accessToken = (formData.get("access_token") as string)?.trim();

  const update: Record<string, any> = { dominio, actualizado_en: new Date().toISOString() };
  // Solo pisa el token guardado si el usuario escribió uno nuevo — así no
  // hace falta volver a pegarlo cada vez que solo se corrige el dominio.
  if (accessToken) update.access_token = accessToken;

  await db.from("shopify_config").upsert({ id: "default", ...update });
  revalidatePath("/dashboard/ventas/stock");
}

export default async function VentasStockPage() {
  const db = supabaseAdmin();
  const { data: config } = await db.from("shopify_config").select("*").eq("id", "default").maybeSingle();
  const conectado = !!(config?.dominio && config?.access_token);

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow mb-1">Ventas · 01</p>
        <h1 className="page-title">Stock Shopify</h1>
        <p className="page-subtitle">
          Conecta tu tienda para comparar el inventario de Shopify contra el stock local por SKU, y aplicar los
          ajustes que quieras.
        </p>
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">Conexión a Shopify</h2>
          <span className={conectado ? "badge-verde" : "badge-amarillo"}>
            {conectado ? "Conectado" : "Sin conectar"}
          </span>
        </div>
        <p className="text-xs text-brand-400 mb-4">
          Necesitas un access token de una app custom de Shopify (Configuración → Apps → Desarrollar apps) con
          permiso de lectura de productos e inventario.
        </p>
        <form action={guardarConfig} className="grid md:grid-cols-2 gap-3">
          <div>
            <label className="label">Dominio de la tienda</label>
            <input
              name="dominio"
              className="input"
              placeholder="mi-tienda.myshopify.com"
              defaultValue={config?.dominio || ""}
            />
          </div>
          <div>
            <label className="label">Admin API access token</label>
            <input
              name="access_token"
              type="password"
              className="input"
              placeholder={config?.access_token ? "•••••••••••••••• (ya guardado)" : "shpat_..."}
              autoComplete="off"
            />
          </div>
          <div className="md:col-span-2 flex items-center justify-between gap-3">
            {config?.ultima_sincronizacion ? (
              <p className="text-xs text-brand-400">
                Última sincronización: {new Date(config.ultima_sincronizacion).toLocaleString()}
              </p>
            ) : (
              <span />
            )}
            <button className="btn-primary text-sm">Guardar conexión</button>
          </div>
        </form>
      </div>

      <div className="card">
        <h2 className="font-semibold mb-3">Comparar inventario</h2>
        <ShopifyStockSync conectado={conectado} />
      </div>
    </div>
  );
}
