import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { construirPdfEtiquetas } from "@/lib/etiquetas-pdf";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const db = supabaseAdmin();
  const { data: generacion } = await db
    .from("insumo_codigo_barra_generaciones")
    .select("*, insumos(codigo_interno, nombre, marca, tipo)")
    .eq("id", params.id)
    .single();

  if (!generacion) {
    return NextResponse.json({ message: "Generación no encontrada." }, { status: 404 });
  }

  const cant = Number(generacion.cantidad || 0);
  const insumo = generacion.insumos;
  const items = Array.from({ length: cant }, () => ({
    folio: insumo?.codigo_interno || "INSUMO",
    etiquetaSecundaria: insumo?.marca ? `${insumo.nombre} · ${insumo.marca}` : insumo?.nombre || "Insumo",
  }));

  const bytes = await construirPdfEtiquetas(items, {
    titulo: `${insumo?.tipo || "Insumos"} — ${insumo?.nombre || "Insumo"}`,
  });

  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="codigos-insumo-${insumo?.codigo_interno || "batch"}-${params.id.slice(0, 8)}.pdf"`,
    },
  });
}
