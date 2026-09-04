import { supabaseAdmin } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import { esAdministrador } from "@/lib/roles";
import { registrarAuditoria } from "@/lib/auditoria";
import { resolverAprobacion } from "@/lib/aprobaciones";

async function aprobarOrden(id: string, formData: FormData) {
  "use server";
  await resolverAprobacion({
    tabla: "ordenes_compra",
    id,
    decision: "Aprobada",
    comentario: formData.get("comentario") as string,
  });
  revalidatePath(`/dashboard/ordenes-compra/${id}`);
  revalidatePath("/dashboard/ordenes-compra");
}

async function rechazarOrden(id: string, formData: FormData) {
  "use server";
  await resolverAprobacion({
    tabla: "ordenes_compra",
    id,
    decision: "Rechazada",
    comentario: formData.get("comentario") as string,
  });
  revalidatePath(`/dashboard/ordenes-compra/${id}`);
  revalidatePath("/dashboard/ordenes-compra");
}

async function cambiarEstado(id: string, formData: FormData) {
  "use server";
  const db = supabaseAdmin();
  const nuevoEstado = formData.get("estado") as string;
  if (nuevoEstado !== "Borrador" && nuevoEstado !== "Cancelada") {
    const { data: ordenActual } = await db.from("ordenes_compra").select("aprobacion_estado").eq("id", id).single();
    if (ordenActual?.aprobacion_estado !== "Aprobada") {
      throw new Error("Esta orden todavía no tiene el visto bueno del administrador.");
    }
  }
  await db.from("ordenes_compra").update({ estado: nuevoEstado }).eq("id", id);
  await registrarAuditoria({
    accion: "cambiar_estado_orden_compra",
    entidad: "ordenes_compra",
    entidadId: id,
    detalle: { estado: nuevoEstado },
  });
  revalidatePath(`/dashboard/ordenes-compra/${id}`);
}

async function recibirMercancia(id: string, formData: FormData) {
  "use server";
  const db = supabaseAdmin();

  const { data: orden } = await db.from("ordenes_compra").select("*").eq("id", id).single();
  if (!orden) return;
  if (orden.aprobacion_estado !== "Aprobada") {
    throw new Error("Esta orden todavía no tiene el visto bueno del administrador.");
  }

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
        costo_subtotal: Number(item.costo_subtotal) > 0 ? Number(item.costo_subtotal) * (cantidadRecibidaAhora / Number(item.cantidad)) : null,
        costo_total: Number(item.costo_unitario) * cantidadRecibidaAhora || null,
        costo_unitario: Number(item.costo_unitario) || null,
        iva_porcentaje: Number(item.iva_porcentaje) || 0,
        iva_incluido: !!item.iva_incluido,
        iva_total: Number(item.iva_total) || 0,
        envio_total: Number(item.envio_total) || 0,
        referencia: orden.folio,
        notas: "Recepción de orden de compra",
      });

      // El costo por unidad de esta orden de compra (calculado al crearla a
      // partir de lo pagado en total) se vuelve el costo de referencia del
      // insumo, para costeo de fórmulas/BOM y precio sugerido.
      if (Number(item.costo_unitario) > 0) {
        await db.from("insumos").update({ costo_unitario_actual: item.costo_unitario }).eq("id", item.insumo_id);
      }
    }
  }

  const nuevoEstado = totalRecibido >= totalPedido ? "Recibida total" : totalRecibido > 0 ? "Recibida parcial" : orden.estado;
  await db.from("ordenes_compra").update({ estado: nuevoEstado }).eq("id", id);

  await registrarAuditoria({
    accion: "recibir_mercancia_orden_compra",
    entidad: "ordenes_compra",
    entidadId: id,
    sucursalId: orden.sucursal_id,
    detalle: { folio: orden.folio, estado: nuevoEstado, total_recibido: totalRecibido },
  });

  revalidatePath(`/dashboard/ordenes-compra/${id}`);
}

export default async function DetalleOrdenCompraPage({ params }: { params: { id: string } }) {
  const db = supabaseAdmin();
  const user = await getSessionUser();
  const esAdmin = esAdministrador(user?.roles);
  const [{ data: orden }, { data: items }] = await Promise.all([
    db
      .from("ordenes_compra")
      .select("*, proveedores(*), sucursales(nombre), aprobador:aprobado_por(nombre_completo)")
      .eq("id", params.id)
      .single(),
    db.from("orden_compra_items").select("*, insumos(nombre, codigo_interno, unidad_medida)").eq("orden_compra_id", params.id),
  ]);

  if (!orden) return <p>Orden no encontrada.</p>;
  const puedeAvanzar = orden.aprobacion_estado === "Aprobada";

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
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="font-semibold">Visto bueno del administrador</h2>
            <p className="text-sm mt-1">
              Estado:{" "}
              <span
                className={
                  orden.aprobacion_estado === "Aprobada"
                    ? "badge-verde"
                    : orden.aprobacion_estado === "Rechazada"
                    ? "badge-rojo"
                    : "badge-amarillo"
                }
              >
                {orden.aprobacion_estado}
              </span>
            </p>
            {orden.aprobacion_estado !== "Pendiente" && (
              <p className="text-xs text-brand-400 mt-1">
                {orden.aprobacion_estado} por {orden.aprobador?.nombre_completo || "—"}
                {orden.aprobado_en ? ` · ${new Date(orden.aprobado_en).toLocaleString()}` : ""}
                {orden.comentario_aprobacion ? ` · "${orden.comentario_aprobacion}"` : ""}
              </p>
            )}
          </div>
        </div>
        {orden.aprobacion_estado === "Pendiente" && !esAdmin && (
          <p className="text-xs text-accent-600 mt-3">
            Esta orden todavía no tiene el visto bueno del administrador. No se puede enviar al proveedor ni recibir
            mercancía hasta que sea aprobada.
          </p>
        )}
        {esAdmin && orden.aprobacion_estado === "Pendiente" && (
          <form className="grid md:grid-cols-3 gap-3 items-end mt-3">
            <div className="md:col-span-2">
              <label className="label">Comentario (opcional)</label>
              <input name="comentario" className="input" placeholder="Ej. Ajustar cantidad antes de enviar" />
            </div>
            <div className="flex gap-2">
              <button formAction={aprobarOrden.bind(null, orden.id)} className="btn-primary">
                Dar visto bueno
              </button>
              <button formAction={rechazarOrden.bind(null, orden.id)} className="btn-secondary">
                Rechazar
              </button>
            </div>
          </form>
        )}
      </div>

      <div className="card">
        <h2 className="font-semibold mb-3">Cambiar estado</h2>
        <form action={cambiarEstado.bind(null, orden.id)} className="flex gap-2">
          <select name="estado" defaultValue={orden.estado} className="input !w-64">
            <option>Borrador</option>
            <option disabled={!puedeAvanzar}>Enviada</option>
            <option disabled={!puedeAvanzar}>Confirmada por proveedor</option>
            <option>Cancelada</option>
          </select>
          <button className="btn-secondary">Actualizar</button>
        </form>
        {!puedeAvanzar && (
          <p className="text-xs text-brand-400 mt-2">
            Necesitas el visto bueno del administrador para pasar a "Enviada" o "Confirmada por proveedor".
          </p>
        )}
      </div>

      <div className="card overflow-x-auto">
        <h2 className="font-semibold mb-3">Insumos solicitados</h2>
        {!puedeAvanzar && (
          <p className="text-xs text-accent-600 mb-3">
            La recepción de mercancía está bloqueada hasta que un administrador apruebe esta orden.
          </p>
        )}
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
                      disabled={!puedeAvanzar}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="btn-primary" disabled={!puedeAvanzar}>Registrar recepción</button>
          <p className="text-xs text-brand-500 mt-2">
            Al registrar la recepción, se genera automáticamente la entrada al inventario de insumos de la sucursal solicitante.
          </p>
        </form>
      </div>
    </div>
  );
}
