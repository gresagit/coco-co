import { supabaseAdmin } from "@/lib/supabase/server";
import Link from "next/link";

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
        <a href={`/api/codigos-barra/${generacion.id}/pdf`} target="_blank" className="btn-primary">
          📄 Descargar PDF ({generacion.cantidad} + {generacion.porcentaje_repuesto}% repuesto)
        </a>
      </div>

      <div className="card overflow-x-auto">
        <h2 className="font-semibold mb-3">Folios generados ({piezas?.length || 0})</h2>
        <div className="grid grid-cols-3 md:grid-cols-6 gap-2 text-xs">
          {(piezas || []).map((p: any) => (
            <div key={p.id} className="font-mono bg-brand-50 rounded px-2 py-1 text-center">{p.folio_pieza}</div>
          ))}
        </div>
      </div>
    </div>
  );
}
