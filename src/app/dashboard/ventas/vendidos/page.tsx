import { exigirPermisoPedidosOnline, sucursalActualRequerida } from "@/lib/pedidos-online";
import { supabaseAdmin } from "@/lib/supabase/server";
import VentasTabs from "@/components/VentasTabs";

export default async function VendidosPage() {
  const user = await exigirPermisoPedidosOnline();
  const sucursalId = await sucursalActualRequerida(user);
  const db = supabaseAdmin();
  const [{ data: pedidos, error: errorPedidos }, { data: ventas, error: errorVentas }] = await Promise.all([
    db
      .from("pedidos_tienda")
      .select("*, pedido_tienda_items(*)")
      .eq("sucursal_id", sucursalId)
      .in("estado", ["Vendido", "Enviado"])
      .order("creado_en", { ascending: false })
      .limit(200),
    db
      .from("ventas_pos")
      .select("id, creado_en, folio_pos, total, medio_pago, productos(nombre, sku)")
      .eq("sucursal_id", sucursalId)
      .order("creado_en", { ascending: false })
      .limit(200),
  ]);
  if (errorPedidos) throw errorPedidos;
  if (errorVentas) throw errorVentas;

  const totalTienda = (pedidos || []).reduce(
    (sum: number, pedido: any) => sum + (pedido.pedido_tienda_items || []).reduce(
      (subtotal: number, item: any) => subtotal + Number(item.total || 0),
      0
    ),
    0
  );
  const totalPos = (ventas || []).reduce((sum: number, venta: any) => sum + Number(venta.total || 0), 0);
  const pendientesEnvio = (pedidos || []).filter((pedido: any) => pedido.estado === "Vendido").length;
  const enviados = (pedidos || []).filter((pedido: any) => pedido.estado === "Enviado").length;

  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow mb-1">Ventas · 04</p>
        <h1 className="page-title">Dashboard de vendidos</h1>
        <p className="page-subtitle">Ventas POS y pedidos online pagados, pendientes de envío o ya despachados. Se muestran hasta 200 registros recientes por canal.</p>
      </header>
      <VentasTabs active="/dashboard/ventas/vendidos" />

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="card"><p className="text-xs text-brand-400">Ventas POS registradas</p><p className="font-serif text-2xl">${totalPos.toFixed(2)}</p></div>
        <div className="card"><p className="text-xs text-brand-400">Pedidos online pagados</p><p className="font-serif text-2xl">{pendientesEnvio}</p><p className="text-xs text-brand-400">pendientes de envío · ${totalTienda.toFixed(2)} pedidos online</p></div>
        <div className="card"><p className="text-xs text-brand-400">Pedidos enviados</p><p className="font-serif text-2xl">{enviados}</p></div>
      </section>

      <section className="card overflow-x-auto">
        <h2 className="mb-3 font-semibold">Pedidos de tienda virtual</h2>
        <table className="table-base">
          <thead><tr><th>Pedido</th><th>Fecha</th><th>Cliente</th><th>Artículos</th><th>Total</th><th>Estado</th></tr></thead>
          <tbody>
            {(pedidos || []).map((pedido: any) => {
              const items = pedido.pedido_tienda_items || [];
              const total = items.reduce((sum: number, item: any) => sum + Number(item.total || 0), 0);
              return (
                <tr key={pedido.id}>
                  <td className="font-medium">{pedido.pedido_externo_id}</td>
                  <td className="whitespace-nowrap text-xs">{new Date(pedido.enviado_en || pedido.creado_en).toLocaleString()}</td>
                  <td>{pedido.direccion_envio?.name || pedido.cliente?.name || "—"}</td>
                  <td>{items.map((item: any) => `${item.sku} ×${Number(item.cantidad)}`).join(", ")}</td>
                  <td>${total.toFixed(2)}</td>
                  <td><span className={pedido.estado === "Enviado" ? "badge-verde" : "badge-amarillo"}>{pedido.estado === "Enviado" ? "Enviado" : "Pagado · por enviar"}</span></td>
                </tr>
              );
            })}
            {(pedidos || []).length === 0 && <tr><td colSpan={6} className="py-4 text-center text-sm text-brand-400">Aún no hay pedidos online pagados.</td></tr>}
          </tbody>
        </table>
      </section>

      <section className="card overflow-x-auto">
        <h2 className="mb-3 font-semibold">Ventas de punto de venta</h2>
        <table className="table-base">
          <thead><tr><th>Fecha</th><th>Folio</th><th>Producto</th><th>Total</th><th>Pago</th></tr></thead>
          <tbody>
            {(ventas || []).map((venta: any) => (
              <tr key={venta.id}>
                <td className="whitespace-nowrap text-xs">{new Date(venta.creado_en).toLocaleString()}</td>
                <td>{venta.folio_pos || "—"}</td>
                <td>{venta.productos?.sku} — {venta.productos?.nombre}</td>
                <td>${Number(venta.total).toFixed(2)}</td>
                <td>{venta.medio_pago || "—"}</td>
              </tr>
            ))}
            {(ventas || []).length === 0 && <tr><td colSpan={5} className="py-4 text-center text-sm text-brand-400">Aún no hay ventas POS.</td></tr>}
          </tbody>
        </table>
      </section>
    </div>
  );
}
