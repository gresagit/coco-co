import Link from "next/link";
import VentasTabs from "@/components/VentasTabs";
import {
  exigirPermisoPedidosOnline,
  sucursalActualRequerida,
} from "@/lib/pedidos-online";
import { supabaseAdmin } from "@/lib/supabase/server";

export default async function EnviosPage() {
  const user = await exigirPermisoPedidosOnline();
  const sucursalId = await sucursalActualRequerida(user);
  const { data: pedidos, error } = await supabaseAdmin()
    .from("pedidos_tienda")
    .select("*, pedido_tienda_items(*)")
    .eq("sucursal_id", sucursalId)
    .eq("estado", "Vendido")
    .order("creado_en", { ascending: true })
    .limit(200);
  if (error) throw error;
  const pedidosIds = (pedidos || []).map((pedido: any) => pedido.id);
  const { data: piezasEnviadas, error: errorPiezas } = pedidosIds.length
    ? await supabaseAdmin()
        .from("piezas")
        .select("pedido_tienda_id, producto_id")
        .in("pedido_tienda_id", pedidosIds)
        .eq("estado", "Enviado")
    : { data: [], error: null };
  if (errorPiezas) throw errorPiezas;

  const enviadasPorPedidoProducto = new Map<string, number>();
  for (const pieza of piezasEnviadas || []) {
    const key = `${pieza.pedido_tienda_id}:${pieza.producto_id}`;
    enviadasPorPedidoProducto.set(key, (enviadasPorPedidoProducto.get(key) || 0) + 1);
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow mb-1">Ventas · 03</p>
        <h1 className="page-title">Preparación y envíos</h1>
        <p className="page-subtitle">Escanea cada producto de un pedido antes de empacarlo. Cada lectura descuenta una unidad y el pedido se marca Enviado al completar todas sus piezas.</p>
      </header>
      <VentasTabs active="/dashboard/ventas/envios" />
      <Link href="/dashboard/productos?seccion=enviados" className="btn-primary inline-flex">
        Abrir escáner de envíos
      </Link>
      <div className="grid gap-4">
        {(pedidos || []).map((pedido: any) => (
          <article className="card space-y-4" key={pedido.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold">Pedido {pedido.pedido_externo_id}</h2>
                <p className="text-xs text-brand-400">Recibido {new Date(pedido.creado_externo_en || pedido.creado_en).toLocaleString()}</p>
              </div>
              <span className="badge-amarillo">Pagado · por enviar</span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="text-sm">
                <p className="font-medium">Destinatario</p>
                <p>{pedido.direccion_envio?.name || pedido.cliente?.name || "—"}</p>
                <p>{pedido.direccion_envio?.phone || pedido.cliente?.phone || "—"}</p>
                <p>{pedido.direccion_envio?.address1 || ""} {pedido.direccion_envio?.address2 || ""}</p>
                <p>{[pedido.direccion_envio?.city, pedido.direccion_envio?.state, pedido.direccion_envio?.postalCode, pedido.direccion_envio?.country].filter(Boolean).join(", ")}</p>
              </div>
              <ul className="text-sm">
                {(pedido.pedido_tienda_items || []).map((item: any) => (
                  <li key={item.id}>{item.sku} — {item.nombre_producto}: {Number(item.cantidad)} piezas</li>
                ))}
              </ul>
            </div>
            <div className="space-y-1 border-t border-brand-100 pt-3 text-sm">
              <p className="font-medium">Progreso de escaneo</p>
              {(pedido.pedido_tienda_items || []).map((item: any) => {
                const escaneadas = enviadasPorPedidoProducto.get(`${pedido.id}:${item.producto_id}`) || 0;
                return (
                  <p key={item.id} className="text-brand-500">
                    {item.sku}: {escaneadas} de {Math.ceil(Number(item.cantidad))} escaneadas
                  </p>
                );
              })}
            </div>
          </article>
        ))}
        {(pedidos || []).length === 0 && <div className="card text-sm text-brand-400">No hay pedidos pagados pendientes de envío.</div>}
      </div>
    </div>
  );
}
