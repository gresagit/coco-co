import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { construirPdfEtiquetas } from "@/lib/etiquetas-pdf";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const db = supabaseAdmin();
  const { data: generaciones } = await db
    .from("generaciones_codigo_barra")
    .select("id, productos(sku, nombre)")
    .eq("pedido_id", params.id);

  if (!generaciones || !generaciones.length) {
    return NextResponse.json({ message: "Pedido no encontrado o sin tandas" }, { status: 404 });
  }

  const generacionIds = generaciones.map((g: any) => g.id);
  const skuPorGeneracion: Record<string, string> = {};
  for (const g of generaciones as any[]) skuPorGeneracion[g.id] = g.productos?.sku || "";

  const { data: piezas } = await db
    .from("piezas")
    .select("folio_pieza, generacion_id")
    .in("generacion_id", generacionIds)
    .order("generacion_id")
    .order("folio_pieza");

  const items = (piezas || []).map((p: any) => ({
    folio: p.folio_pieza,
    etiquetaSecundaria: skuPorGeneracion[p.generacion_id],
  }));

  const bytes = await construirPdfEtiquetas(items, { titulo: `Pedido de impresión — ${items.length} etiquetas` });

  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="pedido-${params.id.slice(0, 8)}.pdf"`,
    },
  });
}
