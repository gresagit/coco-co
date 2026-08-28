import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { supabaseAdmin } from "@/lib/supabase/server";

const config: Record<string, { titulo: string; tabla: string; select: string }> = { inventario: { titulo: "Inventario general", tabla: "movimientos", select: "tipo, origen_tipo, cantidad, fecha, referencia" }, insumos: { titulo: "Insumos y materiales", tabla: "insumos", select: "codigo_interno, nombre, tipo, unidad_medida, costo_unitario_actual, activo" }, productos: { titulo: "Productos terminados", tabla: "productos", select: "sku, nombre, presentacion, unidad_venta, activo" }, ventas: { titulo: "Ventas POS", tabla: "ventas_pos", select: "folio_pos, cantidad, total, medio_pago, creado_en" }, compras: { titulo: "Órdenes de compra", tabla: "ordenes_compra", select: "folio, estado, fecha_emision, fecha_entrega_esperada, total" }, produccion: { titulo: "Órdenes de producción", tabla: "ordenes_produccion", select: "folio, estado, cantidad_planeada, frecuencia_reporte, created_at" }, proveedores: { titulo: "Proveedores", tabla: "proveedores", select: "nombre, contacto, telefono, email, tiempo_entrega_dias, activo" }, clientes: { titulo: "Clientes y cotizaciones", tabla: "", select: "" } };

export async function GET(_request: Request, { params }: { params: { tipo: string } }) {
  const selected = config[params.tipo];
  if (!selected) return NextResponse.json({ message: "Reporte no encontrado" }, { status: 404 });
  let rows: Record<string, unknown>[] = [];
  if (selected.tabla) { const result = await supabaseAdmin().from(selected.tabla).select(selected.select).limit(500); rows = (result.data || []) as unknown as Record<string, unknown>[]; }
  const pdf = await PDFDocument.create(); const font = await pdf.embedFont(StandardFonts.Helvetica); const bold = await pdf.embedFont(StandardFonts.HelveticaBold); let page = pdf.addPage([612, 792]); let y = 744;
  page.drawText(selected.titulo, { x: 42, y, size: 20, font: bold, color: rgb(0.1, 0.09, 0.06) }); y -= 20; page.drawText(`Coco & Co. Inventarios · ${new Date().toLocaleString("es-MX")}`, { x: 42, y, size: 9, font, color: rgb(0.4, 0.37, 0.3) }); y -= 28;
  if (!rows.length) page.drawText(selected.tabla ? "No hay registros para este reporte." : "El sistema aún no cuenta con tablas de clientes o cotizaciones.", { x: 42, y, size: 11, font });
  else { const keys = Object.keys(rows[0]).slice(0, 5); page.drawRectangle({ x: 36, y: y - 5, width: 540, height: 20, color: rgb(0.12, 0.11, 0.08) }); keys.forEach((key, index) => page.drawText(key.replaceAll("_", " ").slice(0, 20), { x: 44 + index * 106, y, size: 8, font: bold, color: rgb(1, 1, 1) })); y -= 22; for (const row of rows) { if (y < 48) { page = pdf.addPage([612, 792]); y = 744; } keys.forEach((key, index) => page.drawText(String(row[key] ?? "-").slice(0, 18), { x: 44 + index * 106, y, size: 8, font })); y -= 17; } }
  const bytes = await pdf.save(); return new NextResponse(Buffer.from(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="reporte-${params.tipo}.pdf"` } });
}