import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { generarBarcodePNG } from "@/lib/barcode";

export type EtiquetaItem = {
  folio: string;
  etiquetaSecundaria?: string; // ej. SKU o nombre corto para mostrar bajo el código
};

// Construye un PDF de etiquetas (Code128 + folio legible) en cuadrícula 3x8,
// tamaño carta, listo para enviar a la imprenta externa. Reutilizado por:
// - PDF de etiquetas de un lote de producción ya generado
// - PDF del Generador de Códigos de Barra independiente
export async function construirPdfEtiquetas(
  items: EtiquetaItem[],
  opciones: { filenameHint?: string } = {}
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const pageW = 612,
    pageH = 792,
    margin = 30;
  const cols = 3,
    rows = 8;
  const cellW = (pageW - margin * 2) / cols;
  const cellH = (pageH - margin * 2) / rows;

  let page = pdfDoc.addPage([pageW, pageH]);
  let col = 0,
    row = 0;

  for (const item of items) {
    if (row >= rows) {
      row = 0;
      page = pdfDoc.addPage([pageW, pageH]);
    }

    const x = margin + col * cellW;
    const yTop = pageH - margin - row * cellH;

    const png = await generarBarcodePNG(item.folio);
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

    if (item.etiquetaSecundaria) {
      page.drawText(item.etiquetaSecundaria.slice(0, 28), {
        x: x + 8,
        y: yTop - 14,
        size: 7,
        font,
        color: rgb(0.3, 0.3, 0.3),
      });
    }

    col++;
    if (col >= cols) {
      col = 0;
      row++;
    }
  }

  return pdfDoc.save();
}
