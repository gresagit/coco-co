import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import VentasTabs from "@/components/VentasTabs";
import { registrarAuditoria } from "@/lib/auditoria";
import {
  exigirPermisoPedidosOnline,
  sucursalActualRequerida,
  usuarioPuedeAccederSucursal,
} from "@/lib/pedidos-online";
import { supabaseAdmin } from "@/lib/supabase/server";

async function marcarPedidoEnviado(formData: FormData) {
  "use server";
  const user = await exigirPermisoPedidosOnline("editar");
  const pedidoId = String(formData.get("pedido_id") || "");
  const sucursalId = await sucursalActualRequerida(user);
  const db = supabaseAdmin();
  const { data: pedido, error: errorPedido } = await db
    .from("pedidos_tienda")
    .select("id, sucursal_id, pedido_externo_id")
    .eq("id", pedidoId)
    .single();
  if (errorPedido) throw errorPedido;
  if (pedido.sucursal_id !== sucursalId || !usuarioPuedeAccederSucursal(user, pedido.sucursal_id)) {
    throw new Error("No tienes acceso a la sucursal de este pedido.");
  }

  const { error } = await db.rpc("enviar_pedido_tienda", {
    p_pedido_id: pedidoId,
    p_usuario_id: user.id,
  });
  if (error) throw new Error(error.message);
  await registrarAuditoria({
    accion: "enviar_pedido_tienda",
    entidad: "pedidos_tienda",
    entidadId: pedidoId,
    sucursalId,
    detalle: { pedido_externo_id: pedido.pedido_externo_id },
  });
  revalidatePath("/dashboard/ventas/envios");
  revalidatePath("/dashboard/ventas/vendidos");
  redirect("/dashboard/ventas/envios");
}

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

  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow mb-1">Ventas · 03</p>
        <h1 className="page-title">Preparación y envíos</h1>
        <p className="page-subtitle">Confirma el envío al entregar el pedido a la paquetería; en ese momento se descuenta el stock.</p>
      </header>
      <VentasTabs active="/dashboard/ventas/envios" />
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
            <form action={marcarPedidoEnviado}>
              <input type="hidden" name="pedido_id" value={pedido.id} />
              <button className="btn-primary">Confirmar entrega a paquetería</button>
            </form>
          </article>
        ))}
        {(pedidos || []).length === 0 && <div className="card text-sm text-brand-400">No hay pedidos pagados pendientes de envío.</div>}
      </div>
    </div>
  );
}
