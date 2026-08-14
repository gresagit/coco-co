import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { supabaseAdmin } from "@/lib/supabase/server";
import { generarBarcodePNG } from "@/lib/barcode";

// Genera un PDF con una cuadrícula de etiquetas (código de barras Code128 +
// folio legible) lista para enviar a la imprenta externa. Incluye un 5% de
// etiquetas de repuesto adicionales al final (sugerido, ver pendientes).
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

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const pageW = 612, pageH = 792, margin = 30;
  const cols = 3, rows = 8;
  const cellW = (pageW - margin * 2) / cols;
  const cellH = (pageH - margin * 2) / rows;

  let page = pdfDoc.addPage([pageW, pageH]);
  let col = 0, row = 0;

  for (const folio of folios) {
    if (row >= rows) {
      row = 0;
      page = pdfDoc.addPage([pageW, pageH]);
    }

    const x = margin + col * cellW;
    const yTop = pageH - margin - row * cellH;

    const png = await generarBarcodePNG(folio);
    const img = await pdfDoc.embedPng(png);
    const imgDims = img.scale(1);
    const maxW = cellW - 16;
    const maxH = cellH - 30;
    const scale = Math.min(maxW / imgDims.width, maxH / imgDims.height);
    const w = imgDims.width * scale;
    const h = imgDims.height * scale;

    page.drawRectangle({
      x: x + 4,
      y: yTop - cellH + 4,
      width: cellW - 8,
      height: cellH - 8,
      borderColor: rgb(0.85, 0.85, 0.85),
      borderWidth: 0.5,
    });

    page.drawImage(img, {
      x: x + (cellW - w) / 2,
      y: yTop - cellH + (cellH - h) / 2 + 6,
      width: w,
      height: h,
    });

    page.drawText(lote.productos?.sku || "", {
      x: x + 8,
      y: yTop - 14,
      size: 7,
      font,
      color: rgb(0.3, 0.3, 0.3),
    });

    col++;
    if (col >= cols) {
      col = 0;
      row++;
    }
  }

  const bytes = await pdfDoc.save();
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="etiquetas-${lote.folio_lote}.pdf"`,
    },
  });
}
