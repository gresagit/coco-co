import { supabaseAdmin } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import ShopifyStockSync from "@/components/ShopifyStockSync";
import { registrarAuditoria } from "@/lib/auditoria";

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
  // Nunca se guarda el access token en el detalle de auditoría — es un secreto.
  await registrarAuditoria({
    accion: "guardar_config_shopify",
    entidad: "shopify_config",
    detalle: { dominio, token_actualizado: !!accessToken },
  });
  revalidatePath("/dashboard/ventas/stock");
}

async function guardarCanal(formData: FormData) {
  "use server";
  const db = supabaseAdmin();
  const canal = formData.get("canal") as string;
  const nombre = (formData.get("nombre") as string)?.trim();
  if (!nombre || !["mercadolibre", "amazon"].includes(canal)) return;

  const credenciales: Record<string, string> = {};
  const { data: actual } = await db
    .from("canales_venta_config")
    .select("credenciales")
    .eq("canal", canal)
    .eq("nombre", nombre)
    .maybeSingle();
  Object.assign(credenciales, actual?.credenciales || {});
  for (const campo of ["client_id", "client_secret", "access_token", "refresh_token", "marketplace_id", "seller_id", "region"]) {
    const valor = (formData.get(campo) as string)?.trim();
    if (valor) credenciales[campo] = valor;
  }
  await db.from("canales_venta_config").upsert(
    { canal, nombre, activo: true, credenciales },
    { onConflict: "canal,nombre" }
  );
  await registrarAuditoria({ accion: "guardar_config_canal_venta", entidad: "canales_venta_config", detalle: { canal, nombre } });
  revalidatePath("/dashboard/ventas/stock");
}

export default async function VentasStockPage() {
  const db = supabaseAdmin();
  const [{ data: config }, { data: canales }] = await Promise.all([
    db.from("shopify_config").select("*").eq("id", "default").maybeSingle(),
    db.from("canales_venta_config").select("*").order("canal").order("nombre"),
  ]);
  const conectado = !!(config?.dominio && config?.access_token);

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow mb-1">Ventas · 01</p>
        <h1 className="page-title">Stock de canales de venta</h1>
        <p className="page-subtitle">
          Conecta tus marketplaces para comparar sus publicaciones contra el stock local. Shopify ya está disponible;
          Mercado Libre y Amazon quedan listos para activar mediante sus APIs.
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
        <h2 className="font-semibold mb-1">Mercado Libre y Amazon</h2>
        <p className="text-sm text-brand-500 mb-4">
          Guarda aquí la configuración de cada cuenta. La sincronización real se habilitará al completar OAuth de
          Mercado Libre o las credenciales SP-API de Amazon.
        </p>
        <div className="grid lg:grid-cols-2 gap-6">
          {["mercadolibre", "amazon"].map((canal) => {
            const configCanal = (canales || []).find((item: any) => item.canal === canal);
            const credenciales = configCanal?.credenciales || {};
            const esAmazon = canal === "amazon";
            return (
              <form key={canal} action={guardarCanal} className="border border-brand-150 rounded-lg p-4 grid sm:grid-cols-2 gap-3">
                <input type="hidden" name="canal" value={canal} />
                <h3 className="sm:col-span-2 font-medium">{esAmazon ? "Amazon" : "Mercado Libre"}</h3>
                <div className="sm:col-span-2">
                  <label className="label">Nombre de la cuenta</label>
                  <input name="nombre" className="input" defaultValue={configCanal?.nombre || ""} placeholder={esAmazon ? "Amazon MX" : "Mercado Libre MX"} required />
                </div>
                <div>
                  <label className="label">Client ID</label>
                  <input name="client_id" className="input" defaultValue={credenciales.client_id || ""} autoComplete="off" />
                </div>
                <div>
                  <label className="label">Client secret</label>
                  <input name="client_secret" type="password" className="input" placeholder={credenciales.client_secret ? "Ya guardado" : "Client secret"} autoComplete="new-password" />
                </div>
                <div>
                  <label className="label">Access token</label>
                  <input name="access_token" type="password" className="input" placeholder={credenciales.access_token ? "Ya guardado" : "Access token"} autoComplete="new-password" />
                </div>
                <div>
                  <label className="label">Refresh token</label>
                  <input name="refresh_token" type="password" className="input" placeholder={credenciales.refresh_token ? "Ya guardado" : "Refresh token"} autoComplete="new-password" />
                </div>
                <div>
                  <label className="label">{esAmazon ? "Marketplace ID" : "Seller ID / cuenta"}</label>
                  <input name={esAmazon ? "marketplace_id" : "seller_id"} className="input" defaultValue={credenciales[esAmazon ? "marketplace_id" : "seller_id"] || ""} />
                </div>
                {esAmazon && <div><label className="label">Seller ID</label><input name="seller_id" className="input" defaultValue={credenciales.seller_id || ""} /></div>}
                <div className="sm:col-span-2 flex items-center justify-between gap-3">
                  <span className={configCanal ? "badge-amarillo" : "badge-rojo"}>{configCanal ? "Configurado" : "Sin configurar"}</span>
                  <button className="btn-primary text-sm">Guardar configuración</button>
                </div>
              </form>
            );
          })}
        </div>
      </div>

      <div className="card">
        <h2 className="font-semibold mb-3">Comparar inventario</h2>
        <ShopifyStockSync conectado={conectado} />
      </div>
    </div>
  );
}
