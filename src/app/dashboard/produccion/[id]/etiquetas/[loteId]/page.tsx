import { supabaseAdmin } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import Link from "next/link";

async function marcarReimpresa(piezaId: string, formData: FormData) {
  "use server";
  const db = supabaseAdmin();
  await db.from("reimpresiones_etiqueta").insert({
    pieza_id: piezaId,
    motivo: formData.get("motivo"),
  });
  revalidatePath(`.`);
}

export default async function EtiquetasLotePage({ params }: { params: { id: string; loteId: string } }) {
  const db = supabaseAdmin();
  const { data: lote } = await db.from("lotes").select("*, productos(nombre, sku)").eq("id", params.loteId).single();
  const { data: piezas } = await db.from("piezas").select("*").eq("lote_id", params.loteId).order("folio_pieza");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href={`/dashboard/produccion/${params.id}`} className="text-brand-600 text-sm underline">← Volver a la orden</Link>
          <h1 className="text-2xl font-bold mt-2">Etiquetas · Lote {lote?.folio_lote}</h1>
          <p className="text-brand-500">{lote?.productos?.sku} — {lote?.productos?.nombre} · {piezas?.length || 0} piezas</p>
        </div>
        <a href={`/api/etiquetas/${params.loteId}/pdf`} target="_blank" className="btn-primary">
          Exportar PDF para imprenta (Code128)
        </a>
      </div>

      <div className="card overflow-x-auto">
        <table className="table-base">
          <thead><tr><th>Folio de pieza</th><th>Estado</th><th>Reimprimir</th></tr></thead>
          <tbody>
            {(piezas || []).map((p: any) => (
              <tr key={p.id}>
                <td className="font-mono text-xs">{p.folio_pieza}</td>
                <td>
                  <span className={p.estado === "Disponible" ? "badge-verde" : "badge-amarillo"}>{p.estado}</span>
                </td>
                <td>
                  <form action={marcarReimpresa.bind(null, p.id)} className="flex gap-2">
                    <input name="motivo" placeholder="Motivo (ej. dañada)" className="input !w-40 !py-1" />
                    <button className="btn-secondary text-xs">Usar etiqueta de repuesto</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-brand-500">
        Reimprimir mantiene el mismo folio (trazabilidad no se rompe) y toma una etiqueta física del margen de
        repuesto impreso por adelantado, según el % de excedente definido por producción.
      </p>
    </div>
  );
}
