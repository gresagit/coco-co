import { randomUUID } from "crypto";
import { supabaseAdmin } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { getSessionUser, getSucursalActualId } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria";
import VentaCarrito from "@/components/VentaCarrito";

type ItemCarrito = { producto_id: string; cantidad: number; precio_unitario: number };

/**
 * Registra una venta con uno o varios productos (carrito) en una sola
 * operación. Pensado para ser eficiente cuando se venden varios productos
 * juntos:
 *  - Una sola consulta para leer el stock actual de todos los productos
 *    involucrados (en vez de una consulta por producto).
 *  - Tres escrituras en lote (ventas, stock, movimientos), cada una con un
 *    solo insert/upsert de todas las filas, en vez de un round-trip a la
 *    base de datos por cada producto del carrito.
 */
async function registrarVentaCarrito(formData: FormData): Promise<{ ok: boolean; message?: string }> {
  "use server";
  const user = await getSessionUser();
  const sucursalId = getSucursalActualId();
  if (!user || !sucursalId) {
    return { ok: false, message: "Elige una sucursal antes de registrar la venta." };
  }

  let items: ItemCarrito[];
  try {
    items = JSON.parse((formData.get("items_json") as string) || "[]");
  } catch {
    return { ok: false, message: "El carrito llegó en un formato inválido." };
  }

  items = (items || []).filter((it) => it.producto_id && Number(it.cantidad) > 0);
  if (items.length === 0) {
    return { ok: false, message: "Agrega al menos un producto a la venta." };
  }

  const medioPago = (formData.get("medio_pago") as string) || "Efectivo";
  const folioPos = (formData.get("folio_pos") as string)?.trim() || null;
  const notas = (formData.get("notas") as string)?.trim() || null;

  const db = supabaseAdmin();
  const ventaGrupoId = randomUUID();
  const productoIds = Array.from(new Set(items.map((it) => it.producto_id)));

  // 1 sola consulta para el stock actual de todos los productos del carrito
  const { data: stockRows, error: errStockActual } = await db
    .from("producto_stock")
    .select("producto_id, cantidad_disponible")
    .eq("sucursal_id", sucursalId)
    .in("producto_id", productoIds);

  if (errStockActual) {
    console.error(errStockActual);
    return { ok: false, message: "No se pudo leer el stock actual." };
  }

  const stockActual = new Map((stockRows || []).map((s: any) => [s.producto_id, Number(s.cantidad_disponible)]));

  // Si el mismo producto aparece en más de una línea (o el usuario editó la
  // cantidad), se suman antes de descontar, para no pisar el cálculo.
  const cantidadPorProducto = new Map<string, number>();
  for (const it of items) {
    cantidadPorProducto.set(it.producto_id, (cantidadPorProducto.get(it.producto_id) || 0) + Number(it.cantidad));
  }

  const filasStock = productoIds.map((pid) => ({
    producto_id: pid,
    sucursal_id: sucursalId,
    cantidad_disponible: (stockActual.get(pid) ?? 0) - (cantidadPorProducto.get(pid) || 0),
    stock_minimo: 0,
  }));

  const lineasVenta = items.map((it) => ({
    sucursal_id: sucursalId,
    producto_id: it.producto_id,
    cantidad: it.cantidad,
    precio_unitario: it.precio_unitario,
    total: Number(it.cantidad) * Number(it.precio_unitario),
    medio_pago: medioPago,
    folio_pos: folioPos,
    notas,
    registrada_por: user.id,
    venta_grupo_id: ventaGrupoId,
  }));

  const movimientos = items.map((it) => ({
    tipo: "Salida",
    origen_tipo: "Producto",
    producto_id: it.producto_id,
    sucursal_id: sucursalId,
    cantidad: it.cantidad,
    referencia: folioPos ? `Venta POS ${folioPos}` : "Venta POS",
    usuario_id: user.id,
    notas: notas || "Venta registrada desde punto de venta",
  }));

  // Nota: producto_stock tiene UNIQUE(producto_id, sucursal_id), así que el
  // upsert actualiza las filas existentes e inserta las que falten, todas
  // en una sola llamada.
  const [{ error: errVentas }, { error: errStock }, { error: errMov }] = await Promise.all([
    db.from("ventas_pos").insert(lineasVenta),
    db.from("producto_stock").upsert(filasStock, { onConflict: "producto_id,sucursal_id" }),
    db.from("movimientos").insert(movimientos),
  ]);

  if (errVentas || errStock || errMov) {
    console.error("[registrarVentaCarrito]", { errVentas, errStock, errMov });
    return { ok: false, message: "Ocurrió un error al guardar la venta. Intenta de nuevo." };
  }

  const totalVenta = lineasVenta.reduce((acc, l) => acc + l.total, 0);

  await registrarAuditoria({
    accion: "registrar_venta_pos",
    entidad: "ventas_pos",
    entidadId: ventaGrupoId,
    sucursalId,
    detalle: { productos: items.length, total: totalVenta, medio_pago: medioPago, folio_pos: folioPos },
  });

  revalidatePath("/dashboard/ventas/pos");
  return { ok: true };
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
          .limit(200)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const ventas = ventasData || [];
  const sucursalNombre = sucursal?.nombre || "";

  const hoy = new Date().toDateString();
  const totalHoy = ventas
    .filter((v: any) => new Date(v.creado_en).toDateString() === hoy)
    .reduce((acc: number, v: any) => acc + Number(v.total), 0);

  // Agrupa las líneas (una por producto) que pertenecen a la misma venta
  // (mismo venta_grupo_id) para mostrarlas como un solo ticket en la tabla.
  type Ticket = {
    grupoId: string;
    fecha: string;
    medioPago: string;
    folioPos: string | null;
    items: { nombre: string; cantidad: number }[];
    total: number;
  };

  const ticketsMap = new Map<string, Ticket>();
  for (const v of ventas as any[]) {
    const key = v.venta_grupo_id || v.id;
    if (!ticketsMap.has(key)) {
      ticketsMap.set(key, {
        grupoId: key,
        fecha: v.creado_en,
        medioPago: v.medio_pago,
        folioPos: v.folio_pos,
        items: [],
        total: 0,
      });
    }
    const ticket = ticketsMap.get(key)!;
    ticket.items.push({ nombre: v.productos?.nombre || "—", cantidad: Number(v.cantidad) });
    ticket.total += Number(v.total);
  }
  const tickets = Array.from(ticketsMap.values())
    .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())
    .slice(0, 50);

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow mb-1">Ventas · 02</p>
        <h1 className="page-title">Ventas punto de venta</h1>
        <p className="page-subtitle">
          Agrega uno o varios productos a la venta y regístralos todos juntos. Cada venta descuenta stock de los
          productos vendidos en la sucursal actual.
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
            <VentaCarrito productos={productos || []} registrarVentaCarrito={registrarVentaCarrito} />
          </div>

          <div className="card overflow-x-auto">
            <h2 className="font-semibold mb-3">Últimas ventas — {sucursalNombre}</h2>
            <table className="table-base">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Productos</th>
                  <th>Total</th>
                  <th>Medio de pago</th>
                  <th>Folio</th>
                </tr>
              </thead>
              <tbody>
                {tickets.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-brand-400 text-sm py-4 text-center">
                      Aún no hay ventas registradas en esta sucursal.
                    </td>
                  </tr>
                ) : (
                  tickets.map((t) => (
                    <tr key={t.grupoId}>
                      <td className="text-xs text-brand-400 whitespace-nowrap">{new Date(t.fecha).toLocaleString()}</td>
                      <td className="font-medium">
                        {t.items.map((it, i) => (
                          <span key={i}>
                            {it.nombre} ×{it.cantidad}
                            {i < t.items.length - 1 ? ", " : ""}
                          </span>
                        ))}
                      </td>
                      <td className="font-medium">${t.total.toFixed(2)}</td>
                      <td>{t.medioPago || "—"}</td>
                      <td className="font-mono text-xs">{t.folioPos || "—"}</td>
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
