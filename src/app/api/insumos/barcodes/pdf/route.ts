import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { construirPdfEtiquetas } from "@/lib/etiquetas-pdf";

const MAX_ETIQUETAS = 600;
const MAX_COPIAS_POR_INSUMO = 96;

// GET — atajo rápido: un solo PDF con UN código de barras por cada insumo
// activo del catálogo (uno de cada, no repetidos, sin poder elegir cuáles).
// Se conserva por compatibilidad; el selector nuevo (POST) permite escoger
// cuántos insumos, de qué tipo/material y cuántas copias de cada uno.
export async function GET(req: NextRequest) {
  const db = supabaseAdmin();
  const tipoParam = req.nextUrl.searchParams.get("tipo");

  let query = db.from("insumos").select("codigo_interno, nombre, marca, tipo").eq("activo", true).order("nombre");
  if (tipoParam) query = query.eq("tipo", tipoParam);
  const { data: insumos } = await query;

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

// POST — selector: recibe qué insumos y cuántas copias de cada uno se
// quieren imprimir, ej.
// { "items": [{ "id": "uuid-1", "copias": 12 }, { "id": "uuid-2", "copias": 24 }] }
// Así el usuario puede elegir exactamente cuántos códigos y de qué
// insumo/material imprimir, en vez de recibir siempre "uno de cada uno".
export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "Cuerpo inválido, se esperaba JSON." }, { status: 400 });
  }

  const seleccion: { id: string; copias: number }[] = Array.isArray(body?.items) ? body.items : [];
  if (seleccion.length === 0) {
    return NextResponse.json({ message: "Elige al menos un insumo para generar códigos." }, { status: 400 });
  }

  const ids = seleccion.map((s) => s.id).filter(Boolean);
  if (ids.length === 0) {
    return NextResponse.json({ message: "Elige al menos un insumo para generar códigos." }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { data: insumos } = await db
    .from("insumos")
    .select("id, codigo_interno, nombre, marca, tipo")
    .in("id", ids);

  if (!insumos || insumos.length === 0) {
    return NextResponse.json({ message: "No se encontraron los insumos seleccionados." }, { status: 404 });
  }

  const insumosPorId = new Map(insumos.map((i: any) => [i.id, i]));

  const items: { folio: string; etiquetaSecundaria?: string }[] = [];
  for (const sel of seleccion) {
    const insumo = insumosPorId.get(sel.id);
    if (!insumo) continue;
    const copias = Math.min(Math.max(Math.round(Number(sel.copias) || 0), 1), MAX_COPIAS_POR_INSUMO);
    for (let n = 0; n < copias; n++) {
      items.push({
        folio: insumo.codigo_interno,
        etiquetaSecundaria: insumo.marca ? `${insumo.nombre} · ${insumo.marca}` : insumo.nombre,
      });
    }
  }

  if (items.length === 0) {
    return NextResponse.json({ message: "No hay códigos que generar con esa selección." }, { status: 400 });
  }
  if (items.length > MAX_ETIQUETAS) {
    return NextResponse.json(
      { message: `Son demasiadas etiquetas (${items.length}). El máximo por PDF es ${MAX_ETIQUETAS}; reduce la cantidad o genera varios PDFs.` },
      { status: 400 }
    );
  }

  const tiposSeleccionados = Array.from(new Set(seleccion.map((s) => insumosPorId.get(s.id)?.tipo).filter(Boolean)));
  const titulo =
    tiposSeleccionados.length === 1 ? `Códigos de barra — ${tiposSeleccionados[0]}` : "Códigos de barra — Insumos";

  const bytes = await construirPdfEtiquetas(items, { titulo });

  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="codigos-insumos.pdf"`,
    },
  });
}
