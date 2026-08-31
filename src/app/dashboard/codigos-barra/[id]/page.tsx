import { supabaseAdmin } from "@/lib/supabase/server";
import Link from "next/link";
import ReemplazoEtiquetas from "@/components/ReemplazoEtiquetas";

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
        </div>
      </div>

      <div className="card">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-semibold mb-1">Control de conteo</h2>
            <p className="text-sm text-brand-500">
              Tipo: <b>{generacion.tipo_folio === "universal" ? "Universal no secuencial" : "Secuencial por producto"}</b>
            </p>
          </div>
          <span className={resultadoConteo.ok ? "badge-verde" : resultadoConteo.estado === "sobra" ? "badge-amarillo" : "badge-rojo"}>
            {resultadoConteo.mensaje}
          </span>
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
