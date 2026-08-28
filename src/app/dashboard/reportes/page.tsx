import { supabaseAdmin } from "@/lib/supabase/server";
import ReportesDashboard from "@/components/ReportesDashboard";

export default async function ReportesPage() {
  const db = supabaseAdmin();
  const [{ count: productos }, { count: insumos }, { count: proveedores }, { count: sucursales }, { count: ordenesCompra }, { count: ordenesProduccion }, { data: ventas }, { data: movimientos }] = await Promise.all([
    db.from("productos").select("*", { count: "exact", head: true }).eq("activo", true),
    db.from("insumos").select("*", { count: "exact", head: true }).eq("activo", true),
    db.from("proveedores").select("*", { count: "exact", head: true }).eq("activo", true),
    db.from("sucursales").select("*", { count: "exact", head: true }).eq("activa", true),
    db.from("ordenes_compra").select("*", { count: "exact", head: true }),
    db.from("ordenes_produccion").select("*", { count: "exact", head: true }),
    db.from("ventas_pos").select("total, creado_en").gte("creado_en", new Date(Date.now() - 30 * 86400000).toISOString()),
    db.from("movimientos").select("tipo, origen_tipo, cantidad").gte("fecha", new Date(Date.now() - 30 * 86400000).toISOString()),
  ]);

  const ventasPorDia = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    const key = date.toISOString().slice(0, 10);
    return { label: date.toLocaleDateString("es-MX", { weekday: "short" }).replace(".", ""), value: (ventas || []).filter((venta: any) => String(venta.creado_en).slice(0, 10) === key).reduce((total: number, venta: any) => total + Number(venta.total || 0), 0) };
  });
  const movimientosPorTipo = ["Entrada", "Salida", "Transferencia", "Ajuste"].map((tipo) => ({ label: tipo, value: (movimientos || []).filter((movimiento: any) => movimiento.tipo === tipo).length }));

  return <ReportesDashboard kpis={{ productos: productos || 0, insumos: insumos || 0, proveedores: proveedores || 0, sucursales: sucursales || 0, ordenesCompra: ordenesCompra || 0, ordenesProduccion: ordenesProduccion || 0, ventas30: (ventas || []).reduce((total: number, venta: any) => total + Number(venta.total || 0), 0), movimientos30: (movimientos || []).length }} ventasPorDia={ventasPorDia} movimientosPorTipo={movimientosPorTipo} />;
}