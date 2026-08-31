import { supabaseAdmin } from "@/lib/supabase/server";
import ReportesDashboard from "@/components/ReportesDashboard";

export default async function ReportesPage() {
  const db = supabaseAdmin();
  const [{ count: productos }, { count: insumos }, { count: proveedores }, { count: sucursales }, { count: ordenesCompra }, { count: ordenesProduccion }, { data: ventas }, { data: movimientos }, { data: gastos }] = await Promise.all([
    db.from("productos").select("*", { count: "exact", head: true }).eq("activo", true),
    db.from("insumos").select("*", { count: "exact", head: true }).eq("activo", true),
    db.from("proveedores").select("*", { count: "exact", head: true }).eq("activo", true),
    db.from("sucursales").select("*", { count: "exact", head: true }).eq("activa", true),
    db.from("ordenes_compra").select("*", { count: "exact", head: true }),
    db.from("ordenes_produccion").select("*", { count: "exact", head: true }),
    db.from("ventas_pos").select("total, creado_en").gte("creado_en", new Date(Date.now() - 30 * 86400000).toISOString()),
    db.from("movimientos").select("tipo, origen_tipo, cantidad").gte("fecha", new Date(Date.now() - 30 * 86400000).toISOString()),
    db.from("gastos_empresa").select("monto, fecha").gte("fecha", new Date(Date.now() - 180 * 86400000).toISOString().slice(0, 10)),
  ]);

  const ventasPorDia = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    const key = date.toISOString().slice(0, 10);
    return { label: date.toLocaleDateString("es-MX", { weekday: "short" }).replace(".", ""), value: (ventas || []).filter((venta: any) => String(venta.creado_en).slice(0, 10) === key).reduce((total: number, venta: any) => total + Number(venta.total || 0), 0) };
  });
  const movimientosPorTipo = ["Entrada", "Salida", "Transferencia", "Ajuste"].map((tipo) => ({ label: tipo, value: (movimientos || []).filter((movimiento: any) => movimiento.tipo === tipo).length }));
  const gastos30 = (gastos || []).reduce((total: number, gasto: any) => total + Number(gasto.monto || 0), 0);
  const gastosPorMes = Array.from({ length: 6 }, (_, index) => {
    const date = new Date();
    date.setMonth(date.getMonth() - (5 - index));
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    return {
      label: date.toLocaleDateString("es-MX", { month: "short", year: "2-digit" }).replace(".", ""),
      value: (gastos || []).reduce((total: number, gasto: any) => {
        const gastoKey = new Date(gasto.fecha).toISOString().slice(0, 7);
        return gastoKey === key ? total + Number(gasto.monto || 0) : total;
      }, 0),
    };
  });

  return (
    <ReportesDashboard
      kpis={{
        productos: productos || 0,
        insumos: insumos || 0,
        proveedores: proveedores || 0,
        sucursales: sucursales || 0,
        ordenesCompra: ordenesCompra || 0,
        ordenesProduccion: ordenesProduccion || 0,
        ventas30: (ventas || []).reduce((total: number, venta: any) => total + Number(venta.total || 0), 0),
        movimientos30: (movimientos || []).length,
        gastos30,
      }}
      ventasPorDia={ventasPorDia}
      movimientosPorTipo={movimientosPorTipo}
      gastosPorMes={gastosPorMes}
    />
  );
}