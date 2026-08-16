import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { construirPdfEtiquetas } from "@/lib/etiquetas-pdf";

// Genera un solo PDF con UN código de barras por cada insumo activo del
// catálogo (uno de cada, no repetidos) — útil para imprimir de un jalón las
// etiquetas de todos los insumos nuevos en vez de entrar uno por uno.
export async function GET() {
  const db = supabaseAdmin();
  const { data: insumos } = await db
    .from("insumos")
    .select("codigo_interno, nombre, marca")
    .eq("activo", true)
    .order("nombre");

  if (!insumos || insumos.length === 0) {
    return NextResponse.json({ message: "No hay insumos activos para generar códigos." }, { status: 404 });
  }

  const items = insumos.map((i: any) => ({
    folio: i.codigo_interno,
    etiquetaSecundaria: i.marca ? `${i.nombre} · ${i.marca}` : i.nombre,
  }));

  const bytes = await construirPdfEtiquetas(items, { titulo: "Códigos de barra — Insumos" });

  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="codigos-insumos.pdf"`,
    },
  });
}
