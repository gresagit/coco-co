import { supabaseAdmin } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { getSessionUser, getSucursalActualId } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria";

async function registrarVenta(formData: FormData) {
  "use server";
  const user = await getSessionUser();
  const sucursalId = getSucursalActualId();
  if (!user || !sucursalId) return;

  const db = supabaseAdmin();
  const productoId = formData.get("producto_id") as string;
  const cantidad = Number(formData.get("cantidad") || 0);
  const precioUnitario = Number(formData.get("precio_unitario") || 0);
  const medioPago = (formData.get("medio_pago") as string) || "Efectivo";
  const folioPos = (formData.get("folio_pos") as string)?.trim() || null;
  const notas = (formData.get("notas") as string)?.trim() || null;

  if (!productoId || cantidad <= 0) return;
  const total = cantidad * precioUnitario;

  await db.from("ventas_pos").insert({
    sucursal_id: sucursalId,
    producto_id: productoId,
    cantidad,
    precio_unitario: precioUnitario,
    total,
    medio_pago: medioPago,
    folio_pos: folioPos,
    notas,
    registrada_por: user.id,
  });

  const { data: stockRow } = await db
    .from("producto_stock")
    .select("*")
    .eq("producto_id", productoId)
    .eq("sucursal_id", sucursalId)
    .maybeSingle();

  const nuevaCantidad = Number(stockRow?.cantidad_disponible || 0) - cantidad;
  if (stockRow) {
    await db.from("producto_stock").update({ cantidad_disponible: nuevaCantidad }).eq("id", stockRow.id);
  } else {
    await db
      .from("producto_stock")
      .insert({ producto_id: productoId, sucursal_id: sucursalId, cantidad_disponible: nuevaCantidad, stock_minimo: 0 });
  }

  await db.from("movimientos").insert({
    tipo: "Salida",
    origen_tipo: "Producto",
    producto_id: productoId,
    sucursal_id: sucursalId,
    cantidad,
    referencia: folioPos ? `Venta POS ${folioPos}` : "Venta POS",
    usuario_id: user.id,
    notas: notas || "Venta registrada desde punto de venta",
  });

  await registrarAuditoria({
    accion: "registrar_venta_pos",
    entidad: "ventas_pos",
    entidadId: productoId,
    sucursalId,
    detalle: { cantidad, total, medio_pago: medioPago, folio_pos: folioPos },
  });

  revalidatePath("/dashboard/ventas/pos");
}

export default async function VentasPosPage() {
  const db = supabaseAdmin();
  const sucursalId = getSucursalActualId();

  const [{ data: productos }, { data: sucursal }, { data: ventasData }] = await Promise.all([
    db.from("productos").select("id, sku, nombre").order("nombre"),
    sucursalId ? db.from("sucursales").select("nombre").eq("id", sucursalId).maybeSingle() : Promise.resolve({ data: null as any }),
    sucursalId
      ? db
          .from("ventas_pos")
          .select("*, productos(nombre, sku)")
          .eq("sucursal_id", sucursalId)
          .order("creado_en", { ascending: false })
          .limit(50)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const ventas = ventasData || [];
  const sucursalNombre = sucursal?.nombre || "";

  const hoy = new Date().toDateString();
  const totalHoy = ventas
    .filter((v) => new Date(v.creado_en).toDateString() === hoy)
    .reduce((acc, v) => acc + Number(v.total), 0);

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow mb-1">Ventas · 02</p>
        <h1 className="page-title">Ventas punto de venta</h1>
        <p className="page-subtitle">
          Registra aquí cada venta hecha en caja mientras no hay una integración automática con tu terminal. Cada
          venta descuenta stock del producto en la sucursal actual.
        </p>
      </div>

      {sucursalId && (
        <div className="banner">
          <p className="text-xs text-brand-400 uppercase tracking-wide">Hoy — {sucursalNombre}</p>
          <p className="font-serif text-2xl text-ink mt-0.5">${totalHoy.toFixed(2)}</p>
        </div>
      )}

      {!sucursalId ? (
        <div className="card">
          <p className="text-sm text-accent-600">
            Elige una tienda arriba a la derecha para poder registrar ventas y ver su historial.
          </p>
        </div>
      ) : (
        <>
          <div className="card">
            <h2 className="font-semibold mb-3">Nueva venta</h2>
            <form action={registrarVenta} className="grid md:grid-cols-3 gap-3">
              <div className="md:col-span-2">
                <label className="label">Producto</label>
                <select name="producto_id" className="input" required>
                  <option value="">— Selecciona —</option>
                  {(productos || []).map((p: any) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre} ({p.sku})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Cantidad</label>
                <input name="cantidad" type="number" step="0.01" min="0.01" className="input" required />
              </div>
              <div>
                <label className="label">Precio unitario</label>
                <input name="precio_unitario" type="number" step="0.01" min="0" className="input" defaultValue={0} />
              </div>
              <div>
                <label className="label">Medio de pago</label>
                <select name="medio_pago" className="input">
                  <option>Efectivo</option>
                  <option>Tarjeta</option>
                  <option>Transferencia</option>
                  <option>Otro</option>
                </select>
              </div>
              <div>
                <label className="label">Folio / ticket (opcional)</label>
                <input name="folio_pos" className="input" placeholder="Ej. número de ticket" />
              </div>
              <div className="md:col-span-3">
                <label className="label">Notas (opcional)</label>
                <input name="notas" className="input" />
              </div>
              <div className="md:col-span-3">
                <button className="btn-primary">Registrar venta</button>
              </div>
            </form>
          </div>

          <div className="card overflow-x-auto">
            <h2 className="font-semibold mb-3">Últimas ventas — {sucursalNombre}</h2>
            <table className="table-base">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Producto</th>
                  <th>Cantidad</th>
                  <th>Precio unitario</th>
                  <th>Total</th>
                  <th>Medio de pago</th>
                  <th>Folio</th>
                </tr>
              </thead>
              <tbody>
                {ventas.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-brand-400 text-sm py-4 text-center">
                      Aún no hay ventas registradas en esta sucursal.
                    </td>
                  </tr>
                ) : (
                  ventas.map((v: any) => (
                    <tr key={v.id}>
                      <td className="text-xs text-brand-400 whitespace-nowrap">
                        {new Date(v.creado_en).toLocaleString()}
                      </td>
                      <td className="font-medium">{v.productos?.nombre || "—"}</td>
                      <td>{v.cantidad}</td>
                      <td>${Number(v.precio_unitario).toFixed(2)}</td>
                      <td className="font-medium">${Number(v.total).toFixed(2)}</td>
                      <td>{v.medio_pago || "—"}</td>
                      <td className="font-mono text-xs">{v.folio_pos || "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
