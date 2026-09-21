import { supabaseAdmin } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ajustarCantidadGeneracionInsumo, eliminarGeneracionInsumo } from "@/lib/codigos-barra";

async function ajustarGeneracion(formData: FormData) {
  "use server";
  const generacionId = String(formData.get("generacion_id") || "");
  const cantidad = Number(formData.get("cantidad") || 0);
  if (!generacionId) redirect("/dashboard/insumos/codigos-barra/historial");
  await ajustarCantidadGeneracionInsumo(generacionId, cantidad);
  revalidatePath("/dashboard/insumos/codigos-barra/historial");
  redirect("/dashboard/insumos/codigos-barra/historial");
}

async function eliminarGeneracion(formData: FormData) {
  "use server";
  const generacionId = String(formData.get("generacion_id") || "");
  if (!generacionId) redirect("/dashboard/insumos/codigos-barra/historial");
  await eliminarGeneracionInsumo(generacionId);
  revalidatePath("/dashboard/insumos/codigos-barra/historial");
  redirect("/dashboard/insumos/codigos-barra/historial");
}

export default async function HistorialCodigosBarraInsumosPage() {
  const db = supabaseAdmin();
  const { data: generaciones } = await db
    .from("insumo_codigo_barra_generaciones")
    .select("*, insumos(id, codigo_interno, nombre, marca, tipo)")
    .order("created_at", { ascending: false })
    .limit(200);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow mb-1">Catálogo · 02</p>
          <h1 className="page-title">Historial de códigos de barra</h1>
          <p className="page-subtitle">Consulta cada tanda de insumos, corrige su cantidad o elimina una tanda completa.</p>
        </div>
        <Link href="/dashboard/insumos/codigos-barra" className="btn-primary">Generar PDF</Link>
      </div>

      <div className="card overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr><th>Fecha</th><th>Insumo</th><th>Tipo</th><th>Cantidad</th><th></th></tr>
          </thead>
          <tbody>
            {(generaciones || []).map((g: any) => (
              <tr key={g.id}>
                <td className="text-xs">{new Date(g.created_at).toLocaleString("es-MX")}</td>
                <td>{g.insumos?.codigo_interno} — {g.insumos?.nombre}</td>
                <td>{g.tipo_folio === "universal" ? "Único por producto" : "Seriado"}</td>
                <td>
                  <form action={ajustarGeneracion} className="flex items-center gap-2">
                    <input type="hidden" name="generacion_id" value={g.id} />
                    <input name="cantidad" type="number" min="0" step="1" defaultValue={g.cantidad} className="input !w-20 !py-1" />
                    <button className="btn-secondary text-xs">Guardar</button>
                  </form>
                </td>
                <td className="whitespace-nowrap space-x-3">
                  <a href={`/api/insumos/generaciones/${g.id}/pdf`} target="_blank" rel="noreferrer" className="text-brand-600 text-xs underline">Ver PDF</a>
                  <form action={eliminarGeneracion} className="inline-block">
                    <input type="hidden" name="generacion_id" value={g.id} />
                    <button className="text-red-600 text-xs underline">Eliminar tanda</button>
                  </form>
                </td>
              </tr>
            ))}
            {(generaciones || []).length === 0 && <tr><td colSpan={5} className="text-brand-400 text-sm py-4">Todavía no hay tandas generadas.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}