import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { construirPdfEtiquetas } from "@/lib/etiquetas-pdf";

// Genera un PDF con el código de barras de UN insumo, repetido tantas veces
// como se pida (?copias=12, por defecto 12 — suficiente para una hoja de
// etiquetas típica). El texto del código es el "codigo_interno" del insumo
// (ej. MP-0001), así que al escanearlo el sistema ya sabe a qué insumo
// corresponde sin necesidad de generar folios nuevos.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const db = supabaseAdmin();
  const { data: insumo } = await db.from("insumos").select("*").eq("id", params.id).single();
  if (!insumo) return NextResponse.json({ message: "Insumo no encontrado" }, { status: 404 });

  const copiasParam = Number(req.nextUrl.searchParams.get("copias"));
  const copias = Number.isFinite(copiasParam) && copiasParam > 0 ? Math.min(copiasParam, 96) : 12;

  const items = Array.from({ length: copias }, () => ({
    folio: insumo.codigo_interno,
    etiquetaSecundaria: insumo.marca ? `${insumo.nombre} · ${insumo.marca}` : insumo.nombre,
  }));

  const bytes = await construirPdfEtiquetas(items, {
    titulo: `${insumo.nombre} (${insumo.codigo_interno})`,
  });

  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="codigo-insumo-${insumo.codigo_interno}.pdf"`,
    },
  });
}
