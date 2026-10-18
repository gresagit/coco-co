import { supabaseAdmin } from "@/lib/supabase/server";
import { getSessionUser, getSucursalActualId } from "@/lib/auth";
import { agruparStockProductos } from "@/lib/producto-stock";
import { cargarTodasLasFilas } from "@/lib/supabase/pagination";

export default async function DashboardHome() {
  const user = await getSessionUser();
  const sucursalId = getSucursalActualId();
  const db = supabaseAdmin();

  const [{ count: productos }, { count: insumos }, { count: sucursales }, { count: ocAbiertas }] =
    await Promise.all([
      db.from("productos").select("*", { count: "exact", head: true }).eq("activo", true),
      db.from("insumos").select("*", { count: "exact", head: true }).eq("activo", true),
      db.from("sucursales").select("*", { count: "exact", head: true }).eq("activa", true),
      db.from("ordenes_compra").select("*", { count: "exact", head: true }).in("estado", ["Borrador", "Enviada"]),
    ]);

  // Semáforo: insumos y productos por debajo de su stock mínimo
  const [insumoStock, productoStockRows] = await Promise.all([
    cargarTodasLasFilas((desde, hasta) =>
      db
        .from("insumo_stock")
        .select("cantidad_disponible, stock_minimo, insumos(nombre), sucursales(nombre)")
        .order("cantidad_disponible", { ascending: true })
        .range(desde, hasta)
    ),
    cargarTodasLasFilas((desde, hasta) => {
      let query = db
        .from("producto_stock")
        .select("producto_id, sucursal_id, cantidad_disponible, stock_minimo, productos(nombre), sucursales(nombre)");
      if (sucursalId) query = query.eq("sucursal_id", sucursalId);
      return query.order("producto_id").order("sucursal_id").range(desde, hasta);
    }),
  ]);

  const bajoInsumos = (insumoStock || []).filter((r: any) => r.cantidad_disponible <= r.stock_minimo);
  const productoStock = agruparStockProductos(productoStockRows);
  const bajoProductos = productoStock.filter((r) => r.cantidad_disponible <= r.stock_minimo);

  return (
    <div className="space-y-8">
      <div>
        <p className="eyebrow mb-1">Panel · 00</p>
        <h1 className="page-title">Hola, {user?.nombre_completo?.split(" ")[0]}</h1>
        <p className="page-subtitle">Resumen general del sistema de inventarios.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 stagger-fade">
        <StatCard label="Productos activos" value={productos ?? 0} />
        <StatCard label="Insumos activos" value={insumos ?? 0} />
        <StatCard label="Sucursales activas" value={sucursales ?? 0} />
        <StatCard label="Órdenes de compra abiertas" value={ocAbiertas ?? 0} />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="card">
          <h2 className="font-semibold mb-3 flex items-center gap-2">Semáforo — Insumos</h2>
          {bajoInsumos.length === 0 ? (
            <p className="text-sm text-brand-500">Sin alertas de stock mínimo por ahora.</p>
          ) : (
            <ul className="space-y-2">
              {bajoInsumos.slice(0, 8).map((r: any, i: number) => (
                <li key={i} className="flex items-center justify-between text-sm">
                  <span>
                    {r.insumos?.nombre} <span className="text-brand-400">· {r.sucursales?.nombre}</span>
                  </span>
                  <span className={r.cantidad_disponible <= 0 ? "badge-rojo" : "badge-amarillo"}>
                    {r.cantidad_disponible} disp.
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card">
          <h2 className="font-semibold mb-3 flex items-center gap-2">Semáforo — Producto terminado</h2>
          {bajoProductos.length === 0 ? (
            <p className="text-sm text-brand-500">Sin alertas de stock mínimo por ahora.</p>
          ) : (
            <ul className="space-y-2">
              {bajoProductos.slice(0, 8).map((r: any, i: number) => (
                <li key={i} className="flex items-center justify-between text-sm">
                  <span>
                    {r.productos?.nombre} <span className="text-brand-400">· {r.sucursales?.nombre}</span>
                  </span>
                  <span className={r.cantidad_disponible <= 0 ? "badge-rojo" : "badge-amarillo"}>
                    {r.cantidad_disponible} disp.
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="banner">
      <p className="text-brand-400 text-xs uppercase tracking-wide">{label}</p>
      <p className="font-serif text-3xl text-ink mt-1">{value}</p>
    </div>
  );
}
