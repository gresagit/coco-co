import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { construirPdfEtiquetas } from "@/lib/etiquetas-pdf";

// Genera un PDF con una cuadrícula de etiquetas (código de barras Code128 +
// folio legible) lista para enviar a la imprenta externa. Incluye un 5% de
// etiquetas de repuesto adicionales al final.
export async function GET(_req: Request, { params }: { params: { loteId: string } }) {
  const db = supabaseAdmin();
  const { data: lote } = await db.from("lotes").select("*, productos(nombre, sku)").eq("id", params.loteId).single();
  if (!lote) return NextResponse.json({ message: "Lote no encontrado" }, { status: 404 });

  const { data: piezas } = await db.from("piezas").select("*").eq("lote_id", params.loteId).order("folio_pieza");
  const folios = (piezas || []).map((p: any) => p.folio_pieza);

  // 5% de etiquetas de repuesto (folios de referencia, mismo lote)
  const excedente = Math.max(1, Math.ceil(folios.length * 0.05));
  for (let i = 0; i < excedente; i++) {
    folios.push(`${lote.folio_lote}-REPUESTO-${i + 1}`);
  }

  const bytes = await construirPdfEtiquetas(
    folios.map((f: string) => ({ folio: f, etiquetaSecundaria: lote.productos?.sku }))
  );

  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="etiquetas-${lote.folio_lote}.pdf"`,
    },
  });
}
