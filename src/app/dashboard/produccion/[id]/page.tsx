import { supabaseAdmin } from "@/lib/supabase/server";
import { procesarReporteAvance } from "@/lib/produccion";
import { revalidatePath } from "next/cache";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth";

async function reportarAvance(ordenId: string, formData: FormData) {
  "use server";
  const user = await getSessionUser();
  await procesarReporteAvance({
    ordenProduccionId: ordenId,
    fecha: (formData.get("fecha") as string) || new Date().toISOString().slice(0, 10),
    cantidadProducida: Number(formData.get("cantidad_producida") || 0),
    cantidadMerma: Number(formData.get("cantidad_merma") || 0),
    notas: formData.get("notas") as string,
    reportadoPor: user?.id,
  });
  revalidatePath(`/dashboard/produccion/${ordenId}`);
}

async function cerrarOrden(ordenId: string) {
  "use server";
  const db = supabaseAdmin();
  await db.from("ordenes_produccion").update({ estado: "Cerrada" }).eq("id", ordenId);
  revalidatePath(`/dashboard/produccion/${ordenId}`);
}

export default async function DetalleProduccionPage({ params }: { params: { id: string } }) {
  const db = supabaseAdmin();
  const { data: orden } = await db
    .from("ordenes_produccion")
    .select("*, productos(nombre, sku), sucursales(nombre)")
    .eq("id", params.id)
    .single();
  const { data: reportes } = await db
    .from("reportes_avance")
    .select("*, lotes(folio_lote)")
    .eq("orden_produccion_id", params.id)
    .order("created_at", { ascending: false });
  const { data: lotes } = await db
    .from("lotes")
    .select("*, piezas(count)")
    .eq("orden_produccion_id", params.id);

  if (!orden) return <p>Orden no encontrada.</p>;

  const totalProducido = (reportes || []).reduce((acc: number, r: any) => acc + Number(r.cantidad_producida), 0);
  const totalMerma = (reportes || []).reduce((acc: number, r: any) => acc + Number(r.cantidad_merma), 0);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard/produccion" className="text-brand-600 text-sm underline">← Volver</Link>
        <h1 className="text-2xl font-bold mt-2">{orden.folio}</h1>
        <p className="text-brand-500">{orden.productos?.sku} — {orden.productos?.nombre} · {orden.sucursales?.nombre}</p>
      </div>

      <div className="grid md:grid-cols-4 gap-4">
        <div className="card"><p className="text-brand-500 text-sm">Planeado</p><p className="text-2xl font-bold">{orden.cantidad_planeada}</p></div>
        <div className="card"><p className="text-brand-500 text-sm">Producido</p><p className="text-2xl font-bold">{totalProducido}</p></div>
        <div className="card"><p className="text-brand-500 text-sm">Merma</p><p className="text-2xl font-bold">{totalMerma}</p></div>
        <div className="card"><p className="text-brand-500 text-sm">Estado</p><p className="text-2xl font-bold">{orden.estado}</p></div>
      </div>

      {orden.estado !== "Cerrada" && (
        <div className="card">
          <h2 className="font-semibold mb-3">Reportar avance</h2>
          <form action={reportarAvance.bind(null, orden.id)} className="grid md:grid-cols-4 gap-3 items-end">
            <div>
              <label className="label">Fecha</label>
              <input name="fecha" type="date" className="input" defaultValue={new Date().toISOString().slice(0, 10)} />
            </div>
            <div>
              <label className="label">Cantidad producida</label>
              <input name="cantidad_producida" type="number" step="0.01" className="input" required />
            </div>
            <div>
              <label className="label">Merma</label>
              <input name="cantidad_merma" type="number" step="0.01" className="input" defaultValue={0} />
            </div>
            <div>
              <label className="label">Notas</label>
              <input name="notas" className="input" />
            </div>
            <div className="md:col-span-4">
              <button className="btn-primary">Registrar reporte de avance</button>
            </div>
          </form>
          <p className="text-xs text-brand-500 mt-2">
            Al registrar, el sistema genera un lote y las piezas individuales (folio correlativo), descuenta insumos
            del BOM proporcionalmente (producido + merma) y suma al inventario de producto terminado.
          </p>
        </div>
      )}

      <div className="card overflow-x-auto">
        <h2 className="font-semibold mb-3">Historial de reportes de avance</h2>
        <table className="table-base">
          <thead><tr><th>Fecha</th><th>Producido</th><th>Merma</th><th>Lote generado</th><th>Notas</th></tr></thead>
          <tbody>
            {(reportes || []).map((r: any) => (
              <tr key={r.id}>
                <td>{r.fecha}</td>
                <td>{r.cantidad_producida}</td>
                <td>{r.cantidad_merma}</td>
                <td className="font-mono text-xs">{r.lotes?.folio_lote}</td>
                <td>{r.notas || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card overflow-x-auto">
        <h2 className="font-semibold mb-3">Lotes y trazabilidad</h2>
        <table className="table-base">
          <thead><tr><th>Folio de lote</th><th>Fecha</th><th>Cantidad</th><th>Piezas generadas</th><th></th></tr></thead>
          <tbody>
            {(lotes || []).map((l: any) => (
              <tr key={l.id}>
                <td className="font-mono text-xs">{l.folio_lote}</td>
                <td>{l.fecha_produccion}</td>
                <td>{l.cantidad_total}</td>
                <td>{l.piezas?.[0]?.count ?? 0}</td>
                <td><Link href={`/dashboard/produccion/${orden.id}/etiquetas/${l.id}`} className="text-brand-600 text-xs underline">Generar etiquetas / código de barras</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {orden.estado !== "Cerrada" && (
        <form action={cerrarOrden.bind(null, orden.id)}>
          <button className="btn-secondary">Cerrar orden de producción</button>
        </form>
      )}
    </div>
  );
}
