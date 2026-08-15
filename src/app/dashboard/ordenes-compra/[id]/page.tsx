import { supabaseAdmin } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import Link from "next/link";

async function cambiarEstado(id: string, formData: FormData) {
  "use server";
  const db = supabaseAdmin();
  await db.from("ordenes_compra").update({ estado: formData.get("estado") }).eq("id", id);
  revalidatePath(`/dashboard/ordenes-compra/${id}`);
}

async function recibirMercancia(id: string, formData: FormData) {
  "use server";
  const db = supabaseAdmin();

  const { data: orden } = await db.from("ordenes_compra").select("*").eq("id", id).single();
  if (!orden) return;

  const { data: items } = await db.from("orden_compra_items").select("*").eq("orden_compra_id", id);

  let totalPedido = 0;
  let totalRecibido = 0;

  for (const item of items || []) {
    const cantidadRecibidaAhora = Number(formData.get(`recibido_${item.id}`) || 0);
    totalPedido += Number(item.cantidad);
    const nuevoRecibido = Number(item.cantidad_recibida) + cantidadRecibidaAhora;
    totalRecibido += nuevoRecibido;

    if (cantidadRecibidaAhora > 0) {
      await db.from("orden_compra_items").update({ cantidad_recibida: nuevoRecibido }).eq("id", item.id);

      // Entrada de inventario de insumos en la sucursal solicitante
      const { data: stockRow } = await db
        .from("insumo_stock")
        .select("*")
        .eq("insumo_id", item.insumo_id)
        .eq("sucursal_id", orden.sucursal_id)
        .maybeSingle();

      if (stockRow) {
        await db
          .from("insumo_stock")
          .update({ cantidad_disponible: Number(stockRow.cantidad_disponible) + cantidadRecibidaAhora })
          .eq("id", stockRow.id);
      } else {
        await db.from("insumo_stock").insert({
          insumo_id: item.insumo_id,
          sucursal_id: orden.sucursal_id,
          stock_minimo: 0,
          cantidad_disponible: cantidadRecibidaAhora,
        });
      }

      await db.from("movimientos").insert({
        tipo: "Entrada",
        origen_tipo: "Insumo",
        insumo_id: item.insumo_id,
        sucursal_id: orden.sucursal_id,
        cantidad: cantidadRecibidaAhora,
        referencia: orden.folio,
        notas: "Recepción de orden de compra",
      });
    }
  }

  const nuevoEstado = totalRecibido >= totalPedido ? "Recibida total" : totalRecibido > 0 ? "Recibida parcial" : orden.estado;
  await db.from("ordenes_compra").update({ estado: nuevoEstado }).eq("id", id);

  revalidatePath(`/dashboard/ordenes-compra/${id}`);
}

export default async function DetalleOrdenCompraPage({ params }: { params: { id: string } }) {
  const db = supabaseAdmin();
  const { data: orden } = await db
    .from("ordenes_compra")
    .select("*, proveedores(*), sucursales(nombre)")
    .eq("id", params.id)
    .single();
  const { data: items } = await db
    .from("orden_compra_items")
    .select("*, insumos(nombre, codigo_interno, unidad_medida)")
    .eq("orden_compra_id", params.id);

  if (!orden) return <p>Orden no encontrada.</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/dashboard/ordenes-compra" className="text-brand-600 text-sm underline">← Volver</Link>
          <h1 className="text-2xl font-bold mt-2">{orden.folio}</h1>
          <p className="text-brand-500">{orden.proveedores?.nombre} · Sucursal {orden.sucursales?.nombre}</p>
        </div>
        <a href={`/api/ordenes-compra/${orden.id}/pdf`} target="_blank" className="btn-primary">
          Descargar PDF
        </a>
      </div>

      <div className="card grid md:grid-cols-4 gap-4 text-sm">
        <div><b>Estado</b><br />{orden.estado}</div>
        <div><b>Emisión</b><br />{orden.fecha_emision}</div>
        <div><b>Entrega esperada</b><br />{orden.fecha_entrega_esperada || "—"}</div>
        <div><b>Total</b><br />${Number(orden.total).toFixed(2)}</div>
        <div className="md:col-span-4"><b>Condiciones de pago</b><br />{orden.condiciones_pago || "—"}</div>
      </div>

      <div className="card">
        <h2 className="font-semibold mb-3">Cambiar estado</h2>
        <form action={cambiarEstado.bind(null, orden.id)} className="flex gap-2">
          <select name="estado" defaultValue={orden.estado} className="input !w-64">
            <option>Borrador</option>
            <option>Enviada</option>
            <option>Confirmada por proveedor</option>
            <option>Cancelada</option>
          </select>
          <button className="btn-secondary">Actualizar</button>
        </form>
      </div>

      <div className="card overflow-x-auto">
        <h2 className="font-semibold mb-3">Insumos solicitados</h2>
        <form action={recibirMercancia.bind(null, orden.id)}>
          <table className="table-base mb-4">
            <thead>
              <tr><th>Insumo</th><th>Cantidad</th><th>Costo unit.</th><th>Subtotal</th><th>Recibido</th><th>Recibir ahora</th></tr>
            </thead>
            <tbody>
              {(items || []).map((it: any) => (
                <tr key={it.id}>
                  <td>{it.insumos?.codigo_interno} — {it.insumos?.nombre}</td>
                  <td>{it.cantidad} {it.insumos?.unidad_medida}</td>
                  <td>${Number(it.costo_unitario).toFixed(4)}</td>
                  <td>${Number(it.subtotal).toFixed(2)}</td>
                  <td>{it.cantidad_recibida}</td>
                  <td>
                    <input
                      name={`recibido_${it.id}`}
                      type="number"
                      step="0.01"
                      min="0"
                      max={Number(it.cantidad) - Number(it.cantidad_recibida)}
                      className="input !w-24 !py-1"
                      defaultValue={0}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="btn-primary">Registrar recepción</button>
          <p className="text-xs text-brand-500 mt-2">
            Al registrar la recepción, se genera automáticamente la entrada al inventario de insumos de la sucursal solicitante.
          </p>
        </form>
      </div>
    </div>
  );
}
