import { supabaseAdmin } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

async function crearOrdenProduccion(formData: FormData) {
  "use server";
  const db = supabaseAdmin();
  const productoId = formData.get("producto_id") as string;

  const { data: producto } = await db.from("productos").select("sku").eq("id", productoId).single();
  const { count } = await db.from("ordenes_produccion").select("*", { count: "exact", head: true });
  const folio = `OP-${(producto?.sku.split("-")[0] || "PROD").toUpperCase()}-${String((count || 0) + 1).padStart(4, "0")}`;

  const { data: orden, error } = await db
    .from("ordenes_produccion")
    .insert({
      folio,
      producto_id: productoId,
      sucursal_id: formData.get("sucursal_id"),
      cantidad_planeada: Number(formData.get("cantidad_planeada")),
      frecuencia_reporte: formData.get("frecuencia_reporte"),
      estado: "Abierta",
    })
    .select()
    .single();

  if (!error && orden) redirect(`/dashboard/produccion/${orden.id}`);
}

export default async function NuevaOrdenProduccionPage() {
  const db = supabaseAdmin();
  const { data: productos } = await db.from("productos").select("id, sku, nombre").eq("activo", true).order("nombre");
  const { data: sucursales } = await db.from("sucursales").select("*").eq("activa", true).order("nombre");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Nueva Orden de Producción</h1>
      <form action={crearOrdenProduccion} className="card grid md:grid-cols-2 gap-4">
        <div>
          <label className="label">Producto a fabricar</label>
          <select name="producto_id" className="input" required>
            {(productos || []).map((p: any) => <option key={p.id} value={p.id}>{p.sku} — {p.nombre}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Sucursal</label>
          <select name="sucursal_id" className="input" required>
            {(sucursales || []).map((s: any) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Cantidad planeada</label>
          <input name="cantidad_planeada" type="number" step="0.01" className="input" required />
        </div>
        <div>
          <label className="label">Frecuencia de reporte de avance</label>
          <select name="frecuencia_reporte" className="input" defaultValue="semanal">
            <option value="diario">Diario</option>
            <option value="semanal">Semanal</option>
            <option value="mensual">Mensual</option>
          </select>
        </div>
        <div className="md:col-span-2">
          <button className="btn-primary">Crear orden de producción</button>
        </div>
      </form>
    </div>
  );
}
