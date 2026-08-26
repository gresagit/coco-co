import { supabaseAdmin } from "@/lib/supabase/server";
import { procesarReporteAvance } from "@/lib/produccion";
import { revalidatePath } from "next/cache";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import { esAdministrador } from "@/lib/roles";
import { registrarAuditoria } from "@/lib/auditoria";
import { resolverAprobacion } from "@/lib/aprobaciones";

async function aprobarOrden(ordenId: string, formData: FormData) {
  "use server";
  await resolverAprobacion({
    tabla: "ordenes_produccion",
    id: ordenId,
    decision: "Aprobada",
    comentario: formData.get("comentario") as string,
  });
  revalidatePath(`/dashboard/produccion/${ordenId}`);
  revalidatePath("/dashboard/produccion");
}

async function rechazarOrden(ordenId: string, formData: FormData) {
  "use server";
  await resolverAprobacion({
    tabla: "ordenes_produccion",
    id: ordenId,
    decision: "Rechazada",
    comentario: formData.get("comentario") as string,
  });
  revalidatePath(`/dashboard/produccion/${ordenId}`);
  revalidatePath("/dashboard/produccion");
}

async function reportarAvance(ordenId: string, formData: FormData) {
  "use server";
  const db = supabaseAdmin();
  const { data: ordenActual } = await db
    .from("ordenes_produccion")
    .select("aprobacion_estado")
    .eq("id", ordenId)
    .single();
  if (ordenActual?.aprobacion_estado !== "Aprobada") {
    throw new Error("Esta orden todavía no tiene el visto bueno del administrador.");
  }

  const user = await getSessionUser();
  const cantidadProducida = Number(formData.get("cantidad_producida") || 0);
  const cantidadMerma = Number(formData.get("cantidad_merma") || 0);
  await procesarReporteAvance({
    ordenProduccionId: ordenId,
    fecha: (formData.get("fecha") as string) || new Date().toISOString().slice(0, 10),
    cantidadProducida,
    cantidadMerma,
    notas: formData.get("notas") as string,
    reportadoPor: user?.id,
  });
  await registrarAuditoria({
    accion: "reportar_avance_produccion",
    entidad: "ordenes_produccion",
    entidadId: ordenId,
    detalle: { cantidad_producida: cantidadProducida, cantidad_merma: cantidadMerma },
  });
  revalidatePath(`/dashboard/produccion/${ordenId}`);
}

async function cerrarOrden(ordenId: string) {
  "use server";
  const db = supabaseAdmin();
  await db.from("ordenes_produccion").update({ estado: "Cerrada" }).eq("id", ordenId);
  await registrarAuditoria({
    accion: "cerrar_orden_produccion",
    entidad: "ordenes_produccion",
    entidadId: ordenId,
  });
  revalidatePath(`/dashboard/produccion/${ordenId}`);
}

export default async function DetalleProduccionPage({ params }: { params: { id: string } }) {
  const db = supabaseAdmin();
  const user = await getSessionUser();
  const esAdmin = esAdministrador(user?.roles);
  const { data: orden } = await db
    .from("ordenes_produccion")
    .select("*, productos(nombre, sku), sucursales(nombre), aprobador:aprobado_por(nombre_completo)")
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

      <div className="card">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="font-semibold">Visto bueno del administrador</h2>
            <p className="text-sm mt-1">
              Estado:{" "}
              <span
                className={
                  orden.aprobacion_estado === "Aprobada"
                    ? "badge-verde"
                    : orden.aprobacion_estado === "Rechazada"
                    ? "badge-rojo"
                    : "badge-amarillo"
                }
              >
                {orden.aprobacion_estado}
              </span>
            </p>
            {orden.aprobacion_estado !== "Pendiente" && (
              <p className="text-xs text-brand-400 mt-1">
                {orden.aprobacion_estado} por {orden.aprobador?.nombre_completo || "—"}
                {orden.aprobado_en ? ` · ${new Date(orden.aprobado_en).toLocaleString()}` : ""}
                {orden.comentario_aprobacion ? ` · "${orden.comentario_aprobacion}"` : ""}
              </p>
            )}
          </div>
        </div>
        {orden.aprobacion_estado === "Pendiente" && !esAdmin && (
          <p className="text-xs text-accent-600 mt-3">
            Esta orden todavía no tiene el visto bueno del administrador. No se puede reportar avance hasta que sea aprobada.
          </p>
        )}
        {esAdmin && orden.aprobacion_estado === "Pendiente" && (
          <form className="grid md:grid-cols-3 gap-3 items-end mt-3">
            <div className="md:col-span-2">
              <label className="label">Comentario (opcional)</label>
              <input name="comentario" className="input" placeholder="Ej. Ajustar cantidad antes de producir" />
            </div>
            <div className="flex gap-2">
              <button formAction={aprobarOrden.bind(null, orden.id)} className="btn-primary">
                Dar visto bueno
              </button>
              <button formAction={rechazarOrden.bind(null, orden.id)} className="btn-secondary">
                Rechazar
              </button>
            </div>
          </form>
        )}
      </div>

      {orden.estado !== "Cerrada" && orden.aprobacion_estado === "Aprobada" && (
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
