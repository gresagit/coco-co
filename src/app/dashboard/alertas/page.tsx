import { supabaseAdmin } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

async function crearConfig(formData: FormData) {
  "use server";
  const db = supabaseAdmin();
  await db.from("alertas_config").insert({
    rol_id: formData.get("rol_id") || null,
    tipo_alerta: formData.get("tipo_alerta"),
    canal: formData.get("canal"),
    frecuencia: formData.get("frecuencia"),
  });
  revalidatePath("/dashboard/alertas");
}

async function eliminarConfig(id: string) {
  "use server";
  const db = supabaseAdmin();
  await db.from("alertas_config").delete().eq("id", id);
  revalidatePath("/dashboard/alertas");
}

export default async function AlertasPage() {
  const db = supabaseAdmin();
  const { data: roles } = await db.from("roles").select("*").order("nombre");
  const { data: configs } = await db.from("alertas_config").select("*, roles(nombre)").order("tipo_alerta");

  const { data: insumoStock } = await db
    .from("insumo_stock")
    .select("cantidad_disponible, stock_minimo, insumos(nombre), sucursales(nombre)");
  const { data: productoStock } = await db
    .from("producto_stock")
    .select("cantidad_disponible, stock_minimo, productos(nombre), sucursales(nombre)");

  const activasInsumo = (insumoStock || []).filter((r: any) => r.cantidad_disponible <= r.stock_minimo);
  const activasProducto = (productoStock || []).filter((r: any) => r.cantidad_disponible <= r.stock_minimo);

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow mb-1">Operación · 03</p>
        <h1 className="page-title">Alertas y notificaciones</h1>
        <p className="page-subtitle">Semáforo en sistema + correo + WhatsApp. Configura quién recibe qué.</p>
      </div>

      <div className="card">
        <h2 className="font-semibold mb-3">Nueva regla de notificación</h2>
        <form action={crearConfig} className="grid md:grid-cols-4 gap-3 items-end">
          <div>
            <label className="label">Rol que recibe</label>
            <select name="rol_id" className="input">
              {(roles || []).map((r: any) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Alerta de</label>
            <select name="tipo_alerta" className="input">
              <option value="Insumo">Insumo</option>
              <option value="Producto">Producto terminado</option>
            </select>
          </div>
          <div>
            <label className="label">Canal</label>
            <select name="canal" className="input">
              <option value="Sistema">Semáforo en sistema</option>
              <option value="Correo">Correo electrónico</option>
              <option value="WhatsApp">WhatsApp</option>
            </select>
          </div>
          <div>
            <label className="label">Frecuencia</label>
            <select name="frecuencia" className="input">
              <option value="Inmediata">Inmediata</option>
              <option value="Resumen diario">Resumen diario</option>
            </select>
          </div>
          <div className="md:col-span-4">
            <button className="btn-primary">Agregar regla</button>
          </div>
        </form>
        <p className="text-xs text-brand-500 mt-2">
          Correo vía Resend/SendGrid y WhatsApp vía Twilio o Meta Cloud API (plantillas pre-aprobadas) se conectan
          configurando las variables de entorno correspondientes — ver README del proyecto.
        </p>
      </div>

      <div className="card overflow-x-auto">
        <h2 className="font-semibold mb-3">Reglas configuradas</h2>
        <table className="table-base">
          <thead><tr><th>Rol</th><th>Tipo</th><th>Canal</th><th>Frecuencia</th><th></th></tr></thead>
          <tbody>
            {(configs || []).map((c: any) => (
              <tr key={c.id}>
                <td>{c.roles?.nombre}</td>
                <td>{c.tipo_alerta}</td>
                <td>{c.canal}</td>
                <td>{c.frecuencia}</td>
                <td>
                  <form action={eliminarConfig.bind(null, c.id)}>
                    <button className="text-red-600 text-xs underline">Eliminar</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="card">
          <h2 className="font-semibold mb-3">Alertas activas — Insumos ({activasInsumo.length})</h2>
          <ul className="space-y-2 text-sm">
            {activasInsumo.map((r: any, i: number) => (
              <li key={i} className="flex justify-between">
                <span>{r.insumos?.nombre} · {r.sucursales?.nombre}</span>
                <span className={r.cantidad_disponible <= 0 ? "badge-rojo" : "badge-amarillo"}>{r.cantidad_disponible} disp.</span>
              </li>
            ))}
            {activasInsumo.length === 0 && <p className="text-brand-400">Sin alertas activas.</p>}
          </ul>
        </div>
        <div className="card">
          <h2 className="font-semibold mb-3">Alertas activas — Producto terminado ({activasProducto.length})</h2>
          <ul className="space-y-2 text-sm">
            {activasProducto.map((r: any, i: number) => (
              <li key={i} className="flex justify-between">
                <span>{r.productos?.nombre} · {r.sucursales?.nombre}</span>
                <span className={r.cantidad_disponible <= 0 ? "badge-rojo" : "badge-amarillo"}>{r.cantidad_disponible} disp.</span>
              </li>
            ))}
            {activasProducto.length === 0 && <p className="text-brand-400">Sin alertas activas.</p>}
          </ul>
        </div>
      </div>
    </div>
  );
}
