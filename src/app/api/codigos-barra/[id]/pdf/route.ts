import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { construirPdfEtiquetas } from "@/lib/etiquetas-pdf";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const db = supabaseAdmin();
  const { data: generacion } = await db
    .from("generaciones_codigo_barra")
    .select("*, productos(sku, nombre)")
    .eq("id", params.id)
    .single();
  if (!generacion) return NextResponse.json({ message: "Generación no encontrada" }, { status: 404 });

  const { data: piezas } = await db
    .from("piezas")
    .select("folio_pieza")
    .eq("generacion_id", params.id)
    .order("folio_pieza");

  const folios = (piezas || []).map((p: any) => p.folio_pieza);

  const bytes = await construirPdfEtiquetas(
    folios.map((f: string) => ({ folio: f, etiquetaSecundaria: generacion.productos?.sku })),
    { titulo: `${generacion.productos?.nombre || "Producto"} (${generacion.productos?.sku || ""})` }
  );

  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="codigos-${generacion.productos?.sku || "producto"}-${params.id.slice(0, 8)}.pdf"`,
    },
  });
}
