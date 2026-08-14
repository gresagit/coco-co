import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const db = supabaseAdmin();
  const { data: orden } = await db
    .from("ordenes_compra")
    .select("*, proveedores(*), sucursales(nombre, direccion)")
    .eq("id", params.id)
    .single();

  if (!orden) {
    return NextResponse.json({ message: "Orden no encontrada" }, { status: 404 });
  }

  const { data: items } = await db
    .from("orden_compra_items")
    .select("*, insumos(nombre, codigo_interno, unidad_medida)")
    .eq("orden_compra_id", params.id);

  const pdfDoc = await PDFDocument.create();
  let page = pdfDoc.addPage([612, 792]); // Carta
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const margin = 50;
  let y = 792 - margin;
  const green = rgb(0.35, 0.42, 0.28);
  const gray = rgb(0.4, 0.4, 0.4);
  const lightGray = rgb(0.92, 0.94, 0.9);

  function text(str: string, x: number, yy: number, opts: { size?: number; bold?: boolean; color?: any } = {}) {
    page.drawText(str, {
      x,
      y: yy,
      size: opts.size || 10,
      font: opts.bold ? fontBold : font,
      color: opts.color || rgb(0, 0, 0),
    });
  }

  // Encabezado
  text("COCO & CO.", margin, y, { size: 20, bold: true, color: green });
  text("Orden de Compra", margin, y - 22, { size: 12, color: gray });
  text(orden.folio, 612 - margin - 120, y, { size: 16, bold: true, color: green });
  y -= 55;

  page.drawLine({ start: { x: margin, y }, end: { x: 612 - margin, y }, thickness: 1, color: lightGray });
  y -= 25;

  // Datos generales
  text("Proveedor:", margin, y, { bold: true });
  text(orden.proveedores?.nombre || "—", margin + 90, y);
  text("Fecha emisión:", 340, y, { bold: true });
  text(String(orden.fecha_emision || "—"), 430, y);
  y -= 16;

  text("Contacto:", margin, y, { bold: true });
  text(orden.proveedores?.contacto || "—", margin + 90, y);
  text("Entrega esperada:", 340, y, { bold: true });
  text(String(orden.fecha_entrega_esperada || "—"), 460, y);
  y -= 16;

  text("Teléfono / Email:", margin, y, { bold: true });
  text(`${orden.proveedores?.telefono || ""}  ${orden.proveedores?.email || ""}`, margin + 90, y);
  text("Sucursal solicitante:", 340, y, { bold: true });
  text(orden.sucursales?.nombre || "—", 460, y);
  y -= 16;

  text("Condiciones de pago:", margin, y, { bold: true });
  text(orden.condiciones_pago || "—", margin + 140, y);
  y -= 30;

  // Tabla de insumos
  page.drawRectangle({ x: margin, y: y - 4, width: 612 - margin * 2, height: 20, color: green });
  text("Insumo", margin + 6, y, { bold: true, color: rgb(1, 1, 1) });
  text("Cant.", 330, y, { bold: true, color: rgb(1, 1, 1) });
  text("Unidad", 380, y, { bold: true, color: rgb(1, 1, 1) });
  text("Costo unit.", 440, y, { bold: true, color: rgb(1, 1, 1) });
  text("Subtotal", 520, y, { bold: true, color: rgb(1, 1, 1) });
  y -= 22;

  let total = 0;
  for (const it of items || []) {
    if (y < 100) {
      page = pdfDoc.addPage([612, 792]);
      y = 792 - margin;
    }
    const nombre = `${it.insumos?.codigo_interno || ""} ${it.insumos?.nombre || ""}`;
    text(nombre.slice(0, 45), margin + 6, y, { size: 9 });
    text(String(it.cantidad), 330, y, { size: 9 });
    text(it.insumos?.unidad_medida || "", 380, y, { size: 9 });
    text(`$${Number(it.costo_unitario).toFixed(4)}`, 440, y, { size: 9 });
    text(`$${Number(it.subtotal).toFixed(2)}`, 520, y, { size: 9 });
    total += Number(it.subtotal);
    y -= 18;
  }

  y -= 10;
  page.drawLine({ start: { x: margin, y }, end: { x: 612 - margin, y }, thickness: 1, color: lightGray });
  y -= 20;
  text("TOTAL:", 440, y, { bold: true, size: 12 });
  text(`$${total.toFixed(2)}`, 520, y, { bold: true, size: 12, color: green });
  y -= 40;

  text(`Estado: ${orden.estado}`, margin, y, { size: 9, color: gray });
  y -= 40;
  page.drawLine({ start: { x: margin, y }, end: { x: margin + 180, y }, thickness: 0.5, color: gray });
  text("Firma / autorización", margin, y - 12, { size: 8, color: gray });

  const bytes = await pdfDoc.save();

  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${orden.folio}.pdf"`,
    },
  });
}
