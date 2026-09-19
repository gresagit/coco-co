import { supabaseAdmin } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import Link from "next/link";
import ReemplazoEtiquetas from "@/components/ReemplazoEtiquetas";
import {
  ajustarCantidadGeneracionCodigoBarra,
  eliminarGeneracionCodigoBarra,
  eliminarPiezasGeneracionPorCantidad,
} from "@/lib/codigos-barra";
import { ConfirmDeleteCodigoBarra } from "@/components/ConfirmDeleteCodigoBarra";

async function eliminarGeneracion(generacionId: string) {
  "use server";
  await eliminarGeneracionCodigoBarra(generacionId);
  revalidatePath("/dashboard/codigos-barra");
  redirect("/dashboard/codigos-barra");
}

async function corregirCantidadGeneracion(formData: FormData) {
  "use server";
  const generacionId = String(formData.get("generacion_id") || "");
  const nuevaCantidad = Number(formData.get("nueva_cantidad") || 0);

  if (!generacionId) {
    redirect("/dashboard/codigos-barra");
  }

  await ajustarCantidadGeneracionCodigoBarra(generacionId, nuevaCantidad);
  revalidatePath("/dashboard/codigos-barra");
  redirect(`/dashboard/codigos-barra/${generacionId}`);
}

async function eliminarPiezasGeneracion(formData: FormData) {
  "use server";
  const generacionId = String(formData.get("generacion_id") || "");
  const cantidadAEliminar = Number(formData.get("cantidad_a_eliminar") || 0);

  if (!generacionId) {
    redirect("/dashboard/codigos-barra");
  }

  await eliminarPiezasGeneracionPorCantidad(generacionId, cantidadAEliminar);
  revalidatePath("/dashboard/codigos-barra");
  redirect(`/dashboard/codigos-barra/${generacionId}`);
}

export default async function DetalleGeneracionPage({ params }: { params: { id: string } }) {
  const db = supabaseAdmin();
  const { data: generacion } = await db
    .from("generaciones_codigo_barra")
    .select("*, productos(sku, nombre), sucursales(nombre), lotes(folio_lote)")
    .eq("id", params.id)
    .single();

  if (!generacion) return <p>Generación no encontrada.</p>;

  const { data: piezas } = await db
    .from("piezas")
    .select("*")
    .eq("generacion_id", params.id)
    .order("folio_pieza");

  const conteoGenerado = piezas?.length ?? 0;
  const conteoSolicitado = Number(generacion.cantidad || 0);
  const resultadoConteo = conteoGenerado === conteoSolicitado
    ? { ok: true, estado: "correcto", mensaje: `Conteo correcto: ${conteoGenerado} de ${conteoSolicitado}.` }
    : conteoGenerado > conteoSolicitado
      ? { ok: false, estado: "sobra", mensaje: `Sobraron ${conteoGenerado - conteoSolicitado} etiquetas.` }
      : { ok: false, estado: "falta", mensaje: `Faltan ${conteoSolicitado - conteoGenerado} etiquetas.` };

  const piezaIds = (piezas || []).map((p: any) => p.id);
  const { data: reimpresiones } = piezaIds.length
    ? await db
        .from("reimpresiones_etiqueta")
        .select("*, piezas(folio_pieza)")
        .in("pieza_id", piezaIds)
        .order("fecha", { ascending: false })
    : { data: [] };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/dashboard/codigos-barra" className="text-brand-600 text-sm underline">← Volver</Link>
          <h1 className="text-2xl font-bold mt-2">
            {generacion.productos?.sku} — {generacion.productos?.nombre}
          </h1>
          <p className="text-brand-500">
            {generacion.sucursales?.nombre}
            {generacion.lotes?.folio_lote ? ` · Lote ${generacion.lotes.folio_lote}` : " · Sin lote asociado"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={`/api/codigos-barra/${generacion.id}/pdf`} target="_blank" className="btn-primary">
            Descargar PDF ({generacion.cantidad} etiquetas)
          </a>
          <a href={`/api/codigos-barra/${generacion.id}/termica`} target="_blank" className="btn-secondary">
            Descargar para térmica
          </a>
          <ConfirmDeleteCodigoBarra
            label="Eliminar historial"
            descripcion={`${generacion.productos?.sku || "Tanda"} · ${generacion.cantidad} etiquetas`}
            action={eliminarGeneracion.bind(null, generacion.id)}
          />
        </div>
      </div>

      <div className="card">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-semibold mb-1">Control de conteo</h2>
            <p className="text-sm text-brand-500">
              Tipo: <b>{generacion.tipo_folio === "universal" ? "Único por producto (no seriado)" : "Seriado por producto"}</b>
            </p>
          </div>
          <span className={resultadoConteo.ok ? "badge-verde" : resultadoConteo.estado === "sobra" ? "badge-amarillo" : "badge-rojo"}>
            {resultadoConteo.mensaje}
          </span>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <form action={corregirCantidadGeneracion} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="generacion_id" value={generacion.id} />
            <div>
              <label className="label text-xs">Corregir cantidad total</label>
              <input
                type="number"
                name="nueva_cantidad"
                min="0"
                step="1"
                defaultValue={Number(generacion.cantidad || 0)}
                className="input !w-28"
              />
            </div>
            <button type="submit" className="btn-primary">Guardar ajuste</button>
          </form>

          <form action={eliminarPiezasGeneracion} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="generacion_id" value={generacion.id} />
            <div>
              <label className="label text-xs">Eliminar solo X etiquetas</label>
              <input
                type="number"
                name="cantidad_a_eliminar"
                min="1"
                max={Math.max(Number(generacion.cantidad || 0), 1)}
                step="1"
                defaultValue={1}
                className="input !w-28"
              />
            </div>
            <button type="submit" className="btn text-xs bg-red-600 text-white hover:bg-red-700">Eliminar X</button>
          </form>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <h2 className="font-semibold mb-1">Generar reemplazo de etiquetas dañadas</h2>
        <p className="text-sm text-brand-500 mb-4">
          Elige exactamente cuáles se dañaron — una, varias sueltas o un rango — y descarga un PDF solo con esas,
          con el mismo folio de siempre. Nada de porcentajes ni etiquetas de más "por si acaso".
        </p>
        <ReemplazoEtiquetas generacionId={generacion.id} piezas={(piezas || []) as any} />
      </div>

      <div className="card overflow-x-auto">
        <h2 className="font-semibold mb-3">Resumen del historial</h2>
        <div className="grid md:grid-cols-3 gap-3 mb-4">
          <div className="rounded-lg border border-brand-200 bg-brand-50/50 p-3">
            <p className="text-xs uppercase text-brand-400">Etiquetas creadas</p>
            <p className="text-2xl font-bold">{conteoGenerado}</p>
          </div>
          <div className="rounded-lg border border-brand-200 bg-brand-50/50 p-3">
            <p className="text-xs uppercase text-brand-400">Reemplazos</p>
            <p className="text-2xl font-bold">{reimpresiones?.length ?? 0}</p>
          </div>
          <div className="rounded-lg border border-brand-200 bg-brand-50/50 p-3">
            <p className="text-xs uppercase text-brand-400">Folio inicial</p>
            <p className="text-sm font-mono font-bold">{(piezas || [])[0]?.folio_pieza || "—"}</p>
          </div>
        </div>

        <table className="table-base">
          <thead>
            <tr>
              <th>Folio</th>
              <th>Estado</th>
              <th>Fecha</th>
            </tr>
          </thead>
          <tbody>
            {(piezas || []).slice(0, 10).map((pieza: any) => (
              <tr key={pieza.id}>
                <td className="font-mono text-xs">{pieza.folio_pieza}</td>
                <td>{pieza.estado || "Pendiente"}</td>
                <td className="text-xs text-brand-400">{new Date(pieza.created_at).toLocaleString("es-MX")}</td>
              </tr>
            ))}
            {(piezas || []).length === 0 && (
              <tr>
                <td colSpan={3} className="text-brand-400 text-sm py-4">Todavía no hay piezas en esta tanda.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {(reimpresiones || []).length > 0 && (
        <div className="card overflow-x-auto">
          <h2 className="font-semibold mb-3">Historial de reemplazos</h2>
          <table className="table-base">
            <thead>
              <tr>
                <th>Folio</th>
                <th>Motivo</th>
                <th>Fecha</th>
              </tr>
            </thead>
            <tbody>
              {(reimpresiones || []).map((r: any) => (
                <tr key={r.id}>
                  <td className="font-mono text-xs">{r.piezas?.folio_pieza}</td>
                  <td>{r.motivo || "—"}</td>
                  <td className="text-xs text-brand-400">{new Date(r.fecha).toLocaleString("es-MX")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
