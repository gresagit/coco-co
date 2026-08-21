import { PDFDocument, PDFFont, StandardFonts, rgb } from "pdf-lib";
import { generarBarcodePNG } from "@/lib/barcode";

export type EtiquetaItem = {
  folio: string;
  etiquetaSecundaria?: string; // ej. SKU o nombre corto para mostrar arriba del código
};

// Reduce el tamaño de fuente hasta que el texto quepa en el ancho disponible,
// sin cortar caracteres. Nunca baja de 5.5pt para que siga siendo legible;
// si ni así cabe, ahí sí se trunca con "…".
function ajustarTextoAAncho(
  font: PDFFont,
  texto: string,
  maxWidth: number,
  tamanoInicial: number,
  tamanoMinimo = 5.5
): { texto: string; tamano: number } {
  let tamano = tamanoInicial;
  while (tamano > tamanoMinimo && font.widthOfTextAtSize(texto, tamano) > maxWidth) {
    tamano -= 0.5;
  }
  if (font.widthOfTextAtSize(texto, tamano) <= maxWidth) {
    return { texto, tamano };
  }
  // No cupo ni al tamaño mínimo: se trunca con puntos suspensivos.
  let recortado = texto;
  while (recortado.length > 1 && font.widthOfTextAtSize(`${recortado}…`, tamanoMinimo) > maxWidth) {
    recortado = recortado.slice(0, -1);
  }
  return { texto: `${recortado}…`, tamano: tamanoMinimo };
}

// Construye un PDF de etiquetas (Code128 + folio legible) en cuadrícula,
// tamaño carta, listo para enviar a la imprenta externa o imprimir en casa.
// Reutilizado por:
// - PDF de etiquetas de un lote de producción ya generado
// - PDF del Generador de Códigos de Barra independiente (producto terminado)
// - PDF de códigos de barra de insumos
//
// A diferencia de la versión anterior, el folio y la etiqueta secundaria se
// dibujan con la fuente del PDF (no van "horneados" dentro del PNG del
// código de barras), así el texto siempre sale nítido sin importar cuánto se
// tenga que reducir la imagen del código para que quepa en la celda. Esto es
// lo que antes hacía que las etiquetas se vieran "deformadas" al descargar
// el PDF: el texto se encogía junto con la imagen hasta volverse ilegible.
export async function construirPdfEtiquetas(
  items: EtiquetaItem[],
  opciones: { filenameHint?: string; titulo?: string; columnas?: number; filas?: number } = {}
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pageW = 612,
    pageH = 792,
    margin = 28;
  const cols = opciones.columnas ?? 3;
  const rows = opciones.filas ?? 8;

  const tituloAltura = opciones.titulo ? 26 : 0;
  const areaY = pageH - margin * 2 - tituloAltura;
  const cellW = (pageW - margin * 2) / cols;
  const cellH = areaY / rows;

  // Espacio interno reservado para cada línea de texto (independiente del
  // tamaño de la imagen del código, así nunca se encima ni se deforma).
  const padCelda = 6;
  const altoEtiquetaSecundaria = 11;
  const altoFolio = 12;

  function dibujarEncabezado(page: any) {
    if (!opciones.titulo) return;
    page.drawText(opciones.titulo!, {
      x: margin,
      y: pageH - margin - 14,
      size: 13,
      font: fontBold,
      color: rgb(0.15, 0.15, 0.15),
    });
    page.drawLine({
      start: { x: margin, y: pageH - margin - tituloAltura + 8 },
      end: { x: pageW - margin, y: pageH - margin - tituloAltura + 8 },
      thickness: 0.75,
      color: rgb(0.85, 0.85, 0.85),
    });
  }

  let page = pdfDoc.addPage([pageW, pageH]);
  dibujarEncabezado(page);
  let col = 0,
    row = 0;

  for (const item of items) {
    if (row >= rows) {
      row = 0;
      col = 0;
      page = pdfDoc.addPage([pageW, pageH]);
      dibujarEncabezado(page);
    }

    const x = margin + col * cellW;
    const yTop = pageH - margin - tituloAltura - row * cellH;

    // Tarjeta de la etiqueta
    page.drawRectangle({
      x: x + 4,
      y: yTop - cellH + 4,
      width: cellW - 8,
      height: cellH - 8,
      borderColor: rgb(0.85, 0.85, 0.85),
      borderWidth: 0.5,
    });

    const cursorY = yTop - 4 - padCelda;

    // 1) Etiqueta secundaria (SKU / nombre corto) — arriba
    if (item.etiquetaSecundaria) {
      const { texto, tamano } = ajustarTextoAAncho(
        fontBold,
        item.etiquetaSecundaria,
        cellW - padCelda * 2,
        8
      );
      const anchoTexto = fontBold.widthOfTextAtSize(texto, tamano);
      page.drawText(texto, {
        x: x + (cellW - anchoTexto) / 2,
        y: cursorY - 8,
        size: tamano,
        font: fontBold,
        color: rgb(0.25, 0.25, 0.25),
      });
    }

    // 2) Código de barras — al centro, ocupa el espacio restante
    const png = await generarBarcodePNG(item.folio);
    const img = await pdfDoc.embedPng(png);
    const maxW = cellW - padCelda * 2;
    const maxH = cellH - padCelda * 2 - altoEtiquetaSecundaria - altoFolio;
    const scale = Math.min(maxW / img.width, maxH / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    const barcodeBottom = yTop - cellH + padCelda + altoFolio;

    page.drawImage(img, {
      x: x + (cellW - w) / 2,
      y: barcodeBottom + Math.max(0, (maxH - h) / 2),
      width: w,
      height: h,
    });

    // 3) Folio legible — abajo, siempre con tamaño de fuente fijo y nítido
    const { texto: folioTexto, tamano: folioTamano } = ajustarTextoAAncho(
      font,
      item.folio,
      cellW - padCelda * 2,
      8
    );
    const anchoFolio = font.widthOfTextAtSize(folioTexto, folioTamano);
    page.drawText(folioTexto, {
      x: x + (cellW - anchoFolio) / 2,
      y: barcodeBottom - 9,
      size: folioTamano,
      font,
      color: rgb(0.2, 0.2, 0.2),
    });

    col++;
    if (col >= cols) {
      col = 0;
      row++;
    }
  }

  return pdfDoc.save();
}

// Construye un PDF para impresora térmica de etiquetas (rollo continuo):
// una etiqueta por página, tamaño chico (por defecto 50mm x 30mm — el
// tamaño típico de rollo para producto), sin cuadrícula ni márgenes de hoja
// carta, porque el driver de la impresora térmica ya trata cada "página"
// como una etiqueta física que avanza el rollo.
export async function construirPdfEtiquetasTermica(
  items: EtiquetaItem[],
  opciones: { anchoMm?: number; altoMm?: number } = {}
): Promise<Uint8Array> {
  const MM = 2.83465; // pt por mm
  const anchoMm = opciones.anchoMm ?? 50;
  const altoMm = opciones.altoMm ?? 30;
  const pageW = anchoMm * MM;
  const pageH = altoMm * MM;
  const margin = 4;

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  for (const item of items) {
    const page = pdfDoc.addPage([pageW, pageH]);
    const maxW = pageW - margin * 2;
    let cursorY = pageH - margin;

    if (item.etiquetaSecundaria) {
      const { texto, tamano } = ajustarTextoAAncho(fontBold, item.etiquetaSecundaria, maxW, 9);
      const anchoTexto = fontBold.widthOfTextAtSize(texto, tamano);
      cursorY -= tamano;
      page.drawText(texto, {
        x: (pageW - anchoTexto) / 2,
        y: cursorY,
        size: tamano,
        font: fontBold,
        color: rgb(0.15, 0.15, 0.15),
      });
      cursorY -= 3;
    }

    // Folio, abajo del todo (se dibuja primero para saber cuánto espacio le
    // queda al código de barras arriba).
    const { texto: folioTexto, tamano: folioTamano } = ajustarTextoAAncho(font, item.folio, maxW, 9);
    const anchoFolio = font.widthOfTextAtSize(folioTexto, folioTamano);
    const folioY = margin;

    const png = await generarBarcodePNG(item.folio);
    const img = await pdfDoc.embedPng(png);
    const maxH = cursorY - margin - folioTamano - 4;
    const scale = Math.min(maxW / img.width, maxH / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    const barcodeBottom = folioY + folioTamano + 4;

    page.drawImage(img, {
      x: (pageW - w) / 2,
      y: barcodeBottom + Math.max(0, (maxH - h) / 2),
      width: w,
      height: h,
    });

    page.drawText(folioTexto, {
      x: (pageW - anchoFolio) / 2,
      y: folioY,
      size: folioTamano,
      font,
      color: rgb(0.15, 0.15, 0.15),
    });
  }

  return pdfDoc.save();
}
