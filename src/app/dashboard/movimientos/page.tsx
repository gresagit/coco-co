import { supabaseAdmin } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";

async function crearTransferencia(formData: FormData) {
  "use server";
  const db = supabaseAdmin();
  const tipoItem = formData.get("tipo_item") as string; // Producto | Insumo
  const itemId = formData.get("item_id") as string;
  const origenId = formData.get("sucursal_origen_id") as string;
  const destinoId = formData.get("sucursal_destino_id") as string;
  const cantidad = Number(formData.get("cantidad"));

  if (origenId === destinoId) return;

  // Resta de origen inmediatamente, queda "En tránsito" hasta confirmar recepción
  const tabla = tipoItem === "Producto" ? "producto_stock" : "insumo_stock";
  const campoId = tipoItem === "Producto" ? "producto_id" : "insumo_id";

  const { data: stockOrigen } = await db.from(tabla).select("*").eq(campoId, itemId).eq("sucursal_id", origenId).maybeSingle();
  if (!stockOrigen || Number(stockOrigen.cantidad_disponible) < cantidad) return;

  await db.from(tabla).update({ cantidad_disponible: Number(stockOrigen.cantidad_disponible) - cantidad }).eq("id", stockOrigen.id);

  const { data: mov } = await db.from("movimientos").insert({
    tipo: "Transferencia",
    origen_tipo: tipoItem,
    producto_id: tipoItem === "Producto" ? itemId : null,
    insumo_id: tipoItem === "Insumo" ? itemId : null,
    sucursal_origen_id: origenId,
    sucursal_destino_id: destinoId,
    cantidad,
    estado: "En tránsito",
  }).select().single();

  await registrarAuditoria({
    accion: "crear_transferencia",
    entidad: "movimientos",
    entidadId: mov?.id,
    detalle: { tipo_item: tipoItem, item_id: itemId, cantidad, sucursal_origen_id: origenId, sucursal_destino_id: destinoId },
  });

  revalidatePath("/dashboard/movimientos");
}

async function confirmarRecepcion(movimientoId: string) {
  "use server";
  const db = supabaseAdmin();
  const { data: mov } = await db.from("movimientos").select("*").eq("id", movimientoId).single();
  if (!mov || mov.estado !== "En tránsito") return;

  const tabla = mov.origen_tipo === "Producto" ? "producto_stock" : "insumo_stock";
  const campoId = mov.origen_tipo === "Producto" ? "producto_id" : "insumo_id";
  const itemId = mov.origen_tipo === "Producto" ? mov.producto_id : mov.insumo_id;

  const { data: stockDestino } = await db.from(tabla).select("*").eq(campoId, itemId).eq("sucursal_id", mov.sucursal_destino_id).maybeSingle();

  if (stockDestino) {
    await db.from(tabla).update({ cantidad_disponible: Number(stockDestino.cantidad_disponible) + Number(mov.cantidad) }).eq("id", stockDestino.id);
  } else {
    await db.from(tabla).insert({ [campoId]: itemId, sucursal_id: mov.sucursal_destino_id, stock_minimo: 0, cantidad_disponible: mov.cantidad });
  }

  await db.from("movimientos").update({ estado: "Recibida" }).eq("id", movimientoId);
  await registrarAuditoria({
    accion: "confirmar_recepcion_transferencia",
    entidad: "movimientos",
    entidadId: movimientoId,
  });
  revalidatePath("/dashboard/movimientos");
}

export default async function MovimientosPage() {
  const db = supabaseAdmin();
  const { data: sucursales } = await db.from("sucursales").select("*").eq("activa", true).order("nombre");
  const { data: productos } = await db.from("productos").select("id, sku, nombre").order("nombre");
  const { data: insumos } = await db.from("insumos").select("id, codigo_interno, nombre").order("nombre");

  const { data: movimientos } = await db
    .from("movimientos")
    .select("*, productos(nombre), insumos(nombre), sucursales(nombre), origen:sucursal_origen_id(nombre), destino:sucursal_destino_id(nombre)")
    .order("fecha", { ascending: false })
    .limit(100);

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow mb-1">Operación · 02</p>
        <h1 className="page-title">Movimientos e inventario</h1>
        <p className="page-subtitle">Entradas, salidas y transferencias entre sucursales.</p>
      </div>

      <div className="card">
        <h2 className="font-semibold mb-3">Nueva transferencia entre sucursales</h2>
        <form action={crearTransferencia} className="grid md:grid-cols-5 gap-3 items-end">
          <div>
            <label className="label">Tipo</label>
            <select name="tipo_item" id="tipo_item" className="input">
              <option value="Producto">Producto</option>
              <option value="Insumo">Insumo</option>
            </select>
          </div>
          <div>
            <label className="label">Producto / Insumo</label>
            <select name="item_id" className="input">
              <optgroup label="Productos">
                {(productos || []).map((p: any) => <option key={p.id} value={p.id}>{p.sku} — {p.nombre}</option>)}
              </optgroup>
              <optgroup label="Insumos">
                {(insumos || []).map((i: any) => <option key={i.id} value={i.id}>{i.codigo_interno} — {i.nombre}</option>)}
              </optgroup>
            </select>
          </div>
          <div>
            <label className="label">Sucursal origen</label>
            <select name="sucursal_origen_id" className="input">
              {(sucursales || []).map((s: any) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Sucursal destino</label>
            <select name="sucursal_destino_id" className="input">
              {(sucursales || []).map((s: any) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Cantidad</label>
            <input name="cantidad" type="number" step="0.01" className="input" required />
          </div>
          <div className="md:col-span-5">
            <button className="btn-primary">Enviar transferencia</button>
          </div>
        </form>
        <p className="text-xs text-brand-500 mt-2">
          Nota: elige correctamente el tipo (Producto/Insumo) antes de seleccionar el elemento; el desplegable
          muestra ambos catálogos agrupados para tu referencia.
        </p>
      </div>

      <div className="card overflow-x-auto">
        <h2 className="font-semibold mb-3">Historial de movimientos</h2>
        <table className="table-base">
          <thead>
            <tr><th>Fecha</th><th>Tipo</th><th>Producto/Insumo</th><th>Sucursal</th><th>Cantidad</th><th>Estado</th><th></th></tr>
          </thead>
          <tbody>
            {(movimientos || []).map((m: any) => (
              <tr key={m.id}>
                <td className="text-xs">{new Date(m.fecha).toLocaleString("es-MX")}</td>
                <td>{m.tipo}</td>
                <td>{m.productos?.nombre || m.insumos?.nombre}</td>
                <td>
                  {m.tipo === "Transferencia"
                    ? `${m.origen?.nombre} → ${m.destino?.nombre}`
                    : m.sucursales?.nombre}
                </td>
                <td>{m.cantidad}</td>
                <td>
                  <span className={m.estado === "En tránsito" ? "badge-amarillo" : "badge-verde"}>{m.estado}</span>
                </td>
                <td>
                  {m.tipo === "Transferencia" && m.estado === "En tránsito" && (
                    <form action={confirmarRecepcion.bind(null, m.id)}>
                      <button className="btn-secondary text-xs">Confirmar recepción</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
