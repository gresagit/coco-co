import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from "pdf-lib";
import { supabaseAdmin } from "@/lib/supabase/server";

type Venta = {
  folio_pos: string | null;
  creado_en: string;
  medio_pago: string | null;
  notas: string | null;
  cantidad: number;
  precio_unitario: number;
  total: number;
  productos: { nombre: string; sku: string } | null;
  sucursales: { nombre: string; direccion: string | null } | null;
  usuarios: { nombre_completo: string } | null;
};

function dinero(valor: number) {
  return `$${valor.toFixed(2)}`;
}

function texto(value: unknown) {
  return String(value || "—");
}

function dibujarFirma(page: PDFPage, font: PDFFont, x: number, y: number, width: number) {
  const gray = rgb(0.4, 0.4, 0.4);
  page.drawLine({ start: { x, y }, end: { x: x + width, y }, thickness: 0.7, color: gray });
  page.drawText("Firma del responsable de venta", { x, y: y - 14, size: 8, font, color: gray });
}

function dibujarEncabezado(
  page: PDFPage,
  venta: Venta,
  font: PDFFont,
  fontBold: PDFFont,
  ancho: number,
  yInicial: number,
  compacto: boolean
) {
  const verde = rgb(0.35, 0.42, 0.28);
  const gris = rgb(0.4, 0.4, 0.4);
  let y = yInicial;
  const margen = compacto ? 14 : 50;
  const centro = ancho / 2;

  page.drawText("COCO & CO.", {
    x: compacto ? margen : margen,
    y,
    size: compacto ? 14 : 20,
    font: fontBold,
    color: verde,
  });
  y -= compacto ? 18 : 24;
  page.drawText("Ticket de venta", { x: margen, y, size: compacto ? 9 : 12, font, color: gris });
  y -= compacto ? 18 : 28;
  page.drawText(texto(venta.sucursales?.nombre), { x: margen, y, size: compacto ? 9 : 10, font: fontBold });
  y -= 14;
  if (!compacto && venta.sucursales?.direccion) {
    page.drawText(venta.sucursales.direccion, { x: margen, y, size: 9, font, color: gris });
    y -= 14;
  }
  page.drawText(`Folio: ${texto(venta.folio_pos)}`, { x: compacto ? margen : centro, y, size: compacto ? 9 : 10, font: fontBold });
  y -= 14;
  page.drawText(`Fecha: ${new Date(venta.creado_en).toLocaleString("es-MX")}`, { x: margen, y, size: compacto ? 8 : 9, font, color: gris });
  return y - (compacto ? 12 : 20);
}

async function crearPdf(ventas: Venta[], formato: string) {
  const compacto = formato === "ticket";
  const ancho = compacto ? 226 : 612;
  const alto = compacto ? Math.max(330, 235 + ventas.length * 38) : 792;
  const margen = compacto ? 14 : 50;
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const verde = rgb(0.35, 0.42, 0.28);
  const grisClaro = rgb(0.87, 0.89, 0.85);
  let page = pdf.addPage([ancho, alto]);
  let y = dibujarEncabezado(page, ventas[0], font, fontBold, ancho, alto - margen, compacto);

  page.drawLine({ start: { x: margen, y }, end: { x: ancho - margen, y }, thickness: 1, color: grisClaro });
  y -= compacto ? 16 : 24;

  if (compacto) {
    page.drawText("Producto", { x: margen, y, size: 8, font: fontBold, color: verde });
    page.drawText("Importe", { x: ancho - margen - 43, y, size: 8, font: fontBold, color: verde });
    y -= 14;
    for (const venta of ventas) {
      const nombre = `${venta.productos?.sku || ""} ${venta.productos?.nombre || "—"}`.trim().slice(0, 31);
      page.drawText(`${venta.cantidad} x ${nombre}`, { x: margen, y, size: 8, font });
      page.drawText(dinero(Number(venta.total)), { x: ancho - margen - 43, y, size: 8, font });
      y -= 17;
      page.drawText(`Unitario ${dinero(Number(venta.precio_unitario))}`, { x: margen + 8, y, size: 7, font, color: rgb(0.4, 0.4, 0.4) });
      y -= 15;
    }
  } else {
    page.drawRectangle({ x: margen, y: y - 4, width: ancho - margen * 2, height: 20, color: verde });
    page.drawText("Producto", { x: margen + 6, y, size: 9, font: fontBold, color: rgb(1, 1, 1) });
    page.drawText("Cant.", { x: 350, y, size: 9, font: fontBold, color: rgb(1, 1, 1) });
    page.drawText("P. unitario", { x: 405, y, size: 9, font: fontBold, color: rgb(1, 1, 1) });
    page.drawText("Subtotal", { x: 510, y, size: 9, font: fontBold, color: rgb(1, 1, 1) });
    y -= 22;
    for (const venta of ventas) {
      const nombre = `${venta.productos?.sku || ""} ${venta.productos?.nombre || "—"}`.trim().slice(0, 48);
      page.drawText(nombre, { x: margen + 6, y, size: 9, font });
      page.drawText(String(venta.cantidad), { x: 350, y, size: 9, font });
      page.drawText(dinero(Number(venta.precio_unitario)), { x: 405, y, size: 9, font });
      page.drawText(dinero(Number(venta.total)), { x: 510, y, size: 9, font });
      y -= 18;
    }
  }

  const total = ventas.reduce((suma, venta) => suma + Number(venta.total), 0);
  y -= compacto ? 6 : 12;
  page.drawLine({ start: { x: margen, y }, end: { x: ancho - margen, y }, thickness: 1, color: grisClaro });
  y -= compacto ? 20 : 24;
  page.drawText("TOTAL", { x: compacto ? margen : 440, y, size: compacto ? 12 : 12, font: fontBold });
  page.drawText(dinero(total), { x: compacto ? ancho - margen - 55 : 520, y, size: 12, font: fontBold, color: verde });
  y -= compacto ? 22 : 28;
  page.drawText(`Medio de pago: ${texto(ventas[0].medio_pago)}`, { x: margen, y, size: compacto ? 8 : 9, font });
  y -= 15;
  page.drawText(`Responsable: ${texto(ventas[0].usuarios?.nombre_completo)}`, { x: margen, y, size: compacto ? 8 : 9, font });
  if (ventas[0].notas) {
    y -= 15;
    page.drawText(`Notas: ${ventas[0].notas.slice(0, compacto ? 35 : 90)}`, { x: margen, y, size: compacto ? 8 : 9, font });
  }
  y -= compacto ? 32 : 48;
  dibujarFirma(page, font, margen, y, compacto ? ancho - margen * 2 : 190);
  return pdf.save();
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const db = supabaseAdmin();
  const formato = req.nextUrl.searchParams.get("formato") === "ticket" ? "ticket" : "carta";
  let { data: ventas } = await db
    .from("ventas_pos")
    .select("*, productos(nombre, sku), sucursales(nombre, direccion), usuarios(nombre_completo)")
    .eq("venta_grupo_id", params.id)
    .order("creado_en");

  if (!ventas?.length) {
    const { data: ventaIndividual } = await db
      .from("ventas_pos")
      .select("*, productos(nombre, sku), sucursales(nombre, direccion), usuarios(nombre_completo)")
      .eq("id", params.id)
      .maybeSingle();
    ventas = ventaIndividual ? [ventaIndividual] : [];
  }

  if (!ventas.length) return NextResponse.json({ message: "Venta no encontrada" }, { status: 404 });

  const bytes = await crearPdf(ventas as Venta[], formato);
  const folio = ventas[0].folio_pos || params.id;
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${folio}-${formato}.pdf"`,
    },
  });
}
