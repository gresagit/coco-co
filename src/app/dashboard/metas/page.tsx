import { getSessionUser, getSucursalActualId } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/server";
import { obtenerPanoramaProduccion, crearMetaProduccion } from "@/lib/metas";
import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";

async function crearMeta(formData: FormData) {
  "use server";
  const user = await getSessionUser();
  const sucursalId = formData.get("sucursal_id") as string;

  const productoId = formData.get("producto_id") as string;
  const cantidadMeta = Number(formData.get("cantidad_meta"));
  await crearMetaProduccion({
    productoId,
    sucursalId,
    cantidadMeta,
    fechaLimite: (formData.get("fecha_limite") as string) || undefined,
    creadoPor: user?.id,
  });

  await registrarAuditoria({
    accion: "crear_meta_produccion",
    entidad: "productos",
    entidadId: productoId,
    sucursalId,
    detalle: { cantidad_meta: cantidadMeta },
  });

  revalidatePath("/dashboard/metas");
}

export default async function MetasPage() {
  const user = await getSessionUser();
  const db = supabaseAdmin();

  let sucursalId = getSucursalActualId();
  if (!sucursalId) {
    let query = db.from("sucursales").select("id").eq("activa", true).order("nombre").limit(1);
    if (!user?.acceso_todas_sucursales && user?.sucursales?.length) {
      query = query.in("id", user.sucursales);
    }
    const { data } = await query.maybeSingle();
    sucursalId = data?.id || null;
  }

  if (!sucursalId) {
    return (
      <div className="space-y-6">
        <div>
          <p className="eyebrow mb-1">Administración · 01</p>
          <h1 className="page-title">Metas de producción</h1>
        </div>
        <div className="card">
          <p className="text-brand-500">No hay sucursales activas configuradas todavía.</p>
        </div>
      </div>
    );
  }

  const { data: sucursal } = await db.from("sucursales").select("nombre").eq("id", sucursalId).single();
  const panorama = await obtenerPanoramaProduccion(sucursalId);

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow mb-1">Administración · 01</p>
        <h1 className="page-title">Metas de producción</h1>
        <p className="page-subtitle">
          Cuánto producir y para cuándo, con la disponibilidad real de materia prima — sucursal{" "}
          <strong className="text-ink">{sucursal?.nombre}</strong>. Para trabajar otra sucursal, cámbiala arriba a la derecha.
        </p>
      </div>

      <div className="space-y-4">
        {panorama.map((producto) => (
          <div key={producto.productoId} className="card">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs text-brand-400 uppercase tracking-wide">{producto.sku}</p>
                <h2 className="font-serif text-lg text-ink">{producto.nombre}</h2>
                <p className="text-sm text-brand-500 mt-0.5">
                  Stock actual: <span className="text-ink font-medium">{producto.stockActual}</span>
                  {producto.maximoFabricableHoy !== null && (
                    <>
                      {" · "}Se pueden fabricar hoy con lo que hay:{" "}
                      <span className="text-ink font-medium">{producto.maximoFabricableHoy}</span>
                    </>
                  )}
                </p>
              </div>

              <form action={crearMeta} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="producto_id" value={producto.productoId} />
                <input type="hidden" name="sucursal_id" value={sucursalId} />
                <div>
                  <label className="label">Cantidad meta</label>
                  <input name="cantidad_meta" type="number" min={1} required className="input w-28" />
                </div>
                <div>
                  <label className="label">Fecha límite</label>
                  <input name="fecha_limite" type="date" className="input w-40" />
                </div>
                <button type="submit" className="btn-primary">Crear meta</button>
              </form>
            </div>

            {producto.metasActivas.length > 0 && (
              <div className="mt-4 space-y-2">
                {producto.metasActivas.map((meta) => {
                  const pct = Math.min(100, Math.round((meta.escaneadas / meta.cantidadMeta) * 100));
                  return (
                    <div key={meta.id} className="rounded-lg border border-brand-150 px-3 py-2">
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="text-ink font-medium">
                          {meta.escaneadas} / {meta.cantidadMeta} piezas
                        </span>
                        <span className="text-brand-400">
                          {pct}% {meta.fechaLimite ? `· límite ${meta.fechaLimite}` : ""}
                        </span>
                      </div>
                      <div className="h-1.5 bg-brand-100 rounded-full overflow-hidden">
                        <div className="h-full bg-ink" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {producto.insumos.length > 0 && (
              <div className="mt-4 overflow-x-auto">
                <table className="table-base">
                  <thead>
                    <tr>
                      <th>Insumo</th>
                      <th>Disponible</th>
                      <th>Por unidad</th>
                      <th>Costo</th>
                      <th>Entrega</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {producto.insumos.map((i) => (
                      <tr key={i.insumoId}>
                        <td>{i.nombre}</td>
                        <td>
                          {i.disponible} {i.unidadMedida}
                        </td>
                        <td>
                          {i.cantidadPorUnidad} {i.unidadMedida}
                        </td>
                        <td>${i.costoUnitario.toFixed(2)}</td>
                        <td>{i.tiempoEntregaDias !== null ? `${i.tiempoEntregaDias} días` : "—"}</td>
                        <td>
                          {i.urgente ? (
                            <span className="badge-rojo">Urgente</span>
                          ) : (
                            <span className="badge-verde">OK</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
