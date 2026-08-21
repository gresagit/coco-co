import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { construirPdfEtiquetas } from "@/lib/etiquetas-pdf";

// PDF con exactamente las etiquetas dañadas que se van a reponer —
// ?piezas=id1,id2,id3 — mismo folio que ya tenían, nada de "repuesto
// genérico" ni sobrantes.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const piezasParam = req.nextUrl.searchParams.get("piezas") || "";
  const piezaIds = piezasParam.split(",").map((s) => s.trim()).filter(Boolean);
  if (!piezaIds.length) {
    return NextResponse.json({ message: "No se indicaron etiquetas a reimprimir" }, { status: 400 });
  }

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
    .in("id", piezaIds)
    .order("folio_pieza");

  const folios = (piezas || []).map((p: any) => p.folio_pieza);
  if (!folios.length) {
    return NextResponse.json({ message: "Ninguna de esas etiquetas pertenece a esta tanda" }, { status: 404 });
  }

  const bytes = await construirPdfEtiquetas(
    folios.map((f: string) => ({ folio: f, etiquetaSecundaria: generacion.productos?.sku })),
    { titulo: `Reemplazo — ${generacion.productos?.nombre || "Producto"} (${generacion.productos?.sku || ""})` }
  );

  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="reemplazo-${generacion.productos?.sku || "producto"}-${params.id.slice(0, 8)}.pdf"`,
    },
  });
}
