import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { registrarAuditoria } from "@/lib/auditoria";
import { exigirPermisoPedidosOnline, sucursalActualRequerida } from "@/lib/pedidos-online";
import { supabaseAdmin } from "@/lib/supabase/server";
import VentasTabs from "@/components/VentasTabs";

async function crearOrdenesProduccionPedido(formData: FormData) {
  "use server";
  const user = await exigirPermisoPedidosOnline("editar");
  const pedidoId = String(formData.get("pedido_id") || "");
  const sucursalId = await sucursalActualRequerida(user);
  const db = supabaseAdmin();
  const { data: pedido, error: errorPedido } = await db
    .from("pedidos_tienda")
    .select("id, sucursal_id")
    .eq("id", pedidoId)
    .single();
  if (errorPedido) throw errorPedido;
  if (pedido.sucursal_id !== sucursalId || (!user.acceso_todas_sucursales && !user.sucursales.includes(pedido.sucursal_id))) {
    throw new Error("No tienes acceso a la sucursal de este pedido.");
  }

  const { data: creadas, error } = await db.rpc("crear_ordenes_produccion_pedido", {
    p_pedido_id: pedidoId,
  });
  if (error) throw error;
  await registrarAuditoria({
    accion: "crear_ordenes_produccion_pedido_online",
    entidad: "pedidos_tienda",
    entidadId: pedidoId,
    sucursalId,
    detalle: { ordenes_creadas: creadas },
  });
  revalidatePath("/dashboard/ventas/pedidos");
  revalidatePath("/dashboard/produccion");
  redirect("/dashboard/ventas/pedidos");
}

async function cancelarPedido(formData: FormData) {
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
  if (pedido.sucursal_id !== sucursalId || (!user.acceso_todas_sucursales && !user.sucursales.includes(pedido.sucursal_id))) {
    throw new Error("No tienes acceso a la sucursal de este pedido.");
  }

  const { error } = await db.rpc("cancelar_pedido_tienda", { p_pedido_id: pedidoId });
  if (error) throw error;
  await registrarAuditoria({
    accion: "cancelar_pedido_tienda",
    entidad: "pedidos_tienda",
    entidadId: pedidoId,
    sucursalId,
    detalle: { pedido_externo_id: pedido.pedido_externo_id },
  });
  revalidatePath("/dashboard/ventas/pedidos");
  revalidatePath("/dashboard/ventas/envios");
  redirect("/dashboard/ventas/pedidos");
}

export default async function PedidosOnlinePage() {
  const user = await exigirPermisoPedidosOnline();
  const sucursalId = await sucursalActualRequerida(user);
  const db = supabaseAdmin();
  const [{ data: pedidos, error }, { data: sucursal, error: errorSucursal }] = await Promise.all([
    db
      .from("pedidos_tienda")
      .select("*, pedido_tienda_items(*)")
      .eq("sucursal_id", sucursalId)
      .in("estado", ["Pendiente", "Vendido"])
      .order("creado_en", { ascending: false })
      .limit(200),
    db.from("sucursales").select("nombre").eq("id", sucursalId).maybeSingle(),
  ]);
  if (error) throw error;
  if (errorSucursal) throw errorSucursal;

  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow mb-1">Ventas · 02</p>
        <h1 className="page-title">Pedidos online</h1>
        <p className="page-subtitle">Pedidos recibidos de la tienda virtual en {sucursal?.nombre || "la sucursal actual"}.</p>
      </header>
      <VentasTabs active="/dashboard/ventas/pedidos" />
      <div className="card overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr><th>Pedido</th><th>Cliente y envío</th><th>Productos</th><th>Estado</th><th>Acción</th></tr>
          </thead>
          <tbody>
            {(pedidos || []).map((pedido: any) => {
              const items = pedido.pedido_tienda_items || [];
              const faltante = items.reduce(
                (suma: number, item: any) => suma + Math.max(Number(item.cantidad) - Number(item.cantidad_reservada), 0),
                0
              );
              const direccion = pedido.direccion_envio || {};
              return (
                <tr key={pedido.id}>
                  <td className="whitespace-nowrap">
                    <strong>{pedido.pedido_externo_id}</strong>
                    <div className="text-xs text-brand-400">{new Date(pedido.creado_externo_en || pedido.creado_en).toLocaleString()}</div>
                  </td>
                  <td className="min-w-48 text-sm">
                    <div>{pedido.cliente?.name || direccion.name || "Cliente online"}</div>
                    <div>{direccion.address1 || ""} {direccion.address2 || ""}</div>
                    <div>{[direccion.city, direccion.state, direccion.postalCode, direccion.country].filter(Boolean).join(", ")}</div>
                    <div>{direccion.phone || pedido.cliente?.phone || ""}</div>
                  </td>
                  <td className="min-w-56 text-sm">
                    {items.map((item: any) => (
                      <div key={item.id}>
                        {item.sku} — {item.nombre_producto}: {Number(item.cantidad)} (reservado {Number(item.cantidad_reservada)})
                      </div>
                    ))}
                    {faltante > 0 && <div className="mt-1 text-amber-700">Por producir / reservar: {faltante}</div>}
                  </td>
                  <td><span className={pedido.estado === "Vendido" ? "badge-verde" : "badge-amarillo"}>{pedido.estado === "Vendido" ? "Pagado" : "Pendiente de pago"}</span></td>
                  <td>
                    {pedido.estado === "Vendido" && faltante > 0 ? (
                      <div className="space-y-2">
                        <form action={crearOrdenesProduccionPedido}>
                          <input type="hidden" name="pedido_id" value={pedido.id} />
                          <button className="btn-secondary whitespace-nowrap">Crear producción faltante</button>
                        </form>
                        <details>
                          <summary className="cursor-pointer text-xs text-red-700 underline">Cancelar pedido</summary>
                          <form action={cancelarPedido} className="mt-2">
                            <input type="hidden" name="pedido_id" value={pedido.id} />
                            <button className="text-xs text-red-700 underline">Confirmar cancelación</button>
                          </form>
                        </details>
                      </div>
                    ) : pedido.estado === "Vendido" ? (
                      <div className="space-y-2">
                        <a className="text-brand-600 text-sm underline" href="/dashboard/ventas/envios">Preparar envío</a>
                        <details>
                          <summary className="cursor-pointer text-xs text-red-700 underline">Cancelar pedido</summary>
                          <form action={cancelarPedido} className="mt-2">
                            <input type="hidden" name="pedido_id" value={pedido.id} />
                            <button className="text-xs text-red-700 underline">Confirmar cancelación</button>
                          </form>
                        </details>
                      </div>
                    ) : (
                      <details>
                        <summary className="cursor-pointer text-xs text-red-700 underline">Cancelar pedido</summary>
                        <form action={cancelarPedido} className="mt-2">
                          <input type="hidden" name="pedido_id" value={pedido.id} />
                          <button className="text-xs text-red-700 underline">Confirmar cancelación</button>
                        </form>
                      </details>
                    )}
                  </td>
                </tr>
              );
            })}
            {(pedidos || []).length === 0 && (
              <tr><td colSpan={5} className="py-5 text-center text-sm text-brand-400">Todavía no han llegado pedidos online.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
