import { supabaseAdmin } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import Link from "next/link";
import { calcularCostoProducto, precioSugerido } from "@/lib/costeo";
import { registrarAuditoria } from "@/lib/auditoria";

async function actualizarStockMinimo(productoId: string, formData: FormData) {
  "use server";
  const db = supabaseAdmin();
  const sucursalId = formData.get("sucursal_id") as string;
  const stockMinimo = Number(formData.get("stock_minimo") || 0);
  await db
    .from("producto_stock")
    .update({ stock_minimo: stockMinimo })
    .eq("producto_id", productoId)
    .eq("sucursal_id", sucursalId);
  await registrarAuditoria({
    accion: "actualizar_stock_minimo",
    entidad: "producto_stock",
    entidadId: productoId,
    detalle: { sucursal_id: sucursalId, stock_minimo: stockMinimo },
  });
  revalidatePath(`/dashboard/productos/${productoId}`);
}

async function actualizarPrecioManual(productoId: string, formData: FormData) {
  "use server";
  const db = supabaseAdmin();
  const val = formData.get("precio_manual") as string;
  await db
    .from("productos")
    .update({ precio_venta_override: val ? Number(val) : null })
    .eq("id", productoId);
  await registrarAuditoria({
    accion: "actualizar_precio_manual",
    entidad: "productos",
    entidadId: productoId,
    detalle: { precio_venta_override: val ? Number(val) : null },
  });
  revalidatePath(`/dashboard/productos/${productoId}`);
}

export default async function ProductoDetallePage({ params }: { params: { id: string } }) {
  const db = supabaseAdmin();
  const { data: producto } = await db.from("productos").select("*").eq("id", params.id).single();
  const { data: stocks } = await db
    .from("producto_stock")
    .select("*, sucursales(nombre)")
    .eq("producto_id", params.id);
  const { data: generaciones } = await db
    .from("generaciones_codigo_barra")
    .select("id, cantidad, created_at")
    .eq("producto_id", params.id)
    .order("created_at", { ascending: false })
    .limit(10);
  const costo = await calcularCostoProducto(params.id);
  const sugerido = precioSugerido(costo, Number(producto?.porcentaje_margen_deseado || 0));

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard/productos" className="text-brand-600 text-sm underline">
          ← Volver a Productos
        </Link>
        <h1 className="text-2xl font-bold mt-2">{producto?.nombre}</h1>
        <p className="text-brand-500">SKU {producto?.sku}</p>
      </div>

      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div>
            <h2 className="font-semibold">Historial de códigos de barra</h2>
            <p className="text-xs text-brand-400">Abre cualquiera de las tandas generadas y ajusta el conteo si te sobró o faltó.</p>
          </div>
          <a href={`/dashboard/codigos-barra`} className="text-brand-600 text-xs underline">Ver todas las tandas</a>
        </div>

        {(generaciones || []).length === 0 ? (
          <p className="text-sm text-brand-400">Todavía no se generaron códigos para este producto.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Cantidad</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {(generaciones || []).map((g: any) => (
                  <tr key={g.id}>
                    <td className="text-xs">{new Date(g.created_at).toLocaleString("es-MX")}</td>
                    <td>{g.cantidad}</td>
                    <td>
                      <a href={`/dashboard/codigos-barra/${g.id}`} className="text-brand-600 text-xs underline">Ver / editar</a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="card">
          <h2 className="font-semibold mb-3">Costeo</h2>
          <p className="text-sm mb-1">Costo calculado (BOM): <b>${costo.toFixed(4)}</b></p>
          <p className="text-sm mb-4">
            Precio sugerido ({(Number(producto?.porcentaje_margen_deseado) * 100).toFixed(0)}% margen): <b>${sugerido.toFixed(2)}</b>
          </p>
          <form action={actualizarPrecioManual.bind(null, params.id)} className="flex gap-2 items-end">
            <div className="flex-1">
              <label className="label">Override manual de precio (opcional)</label>
              <input
                name="precio_manual"
                type="number"
                step="0.01"
                defaultValue={producto?.precio_venta_override ?? ""}
                className="input"
                placeholder="Dejar vacío para usar el sugerido"
              />
            </div>
            <button className="btn-primary">Guardar</button>
          </form>
        </div>

        <div className="card">
          <h2 className="font-semibold mb-3">Datos generales</h2>
          <dl className="text-sm space-y-1">
            <div><b>Presentación:</b> {producto?.presentacion}</div>
            <div><b>Unidad de venta:</b> {producto?.unidad_venta}</div>
            <div><b>¿Insumo de otro producto?:</b> {producto?.es_insumo_de_otro ? "Sí" : "No"}</div>
            <div><b>Estado:</b> {producto?.activo ? "Activo" : "Descontinuado"}</div>
          </dl>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <h2 className="font-semibold mb-3">Stock por sucursal</h2>
        <table className="table-base">
          <thead>
            <tr>
              <th>Sucursal</th>
              <th>Disponible</th>
              <th>Stock mínimo</th>
              <th>Semáforo</th>
              <th>Actualizar mínimo</th>
            </tr>
          </thead>
          <tbody>
            {(stocks || []).map((s: any) => {
              const nivel =
                s.cantidad_disponible <= 0 ? "rojo" : s.cantidad_disponible <= s.stock_minimo ? "amarillo" : "verde";
              return (
                <tr key={s.id}>
                  <td className="font-medium">{s.sucursales?.nombre}</td>
                  <td>{s.cantidad_disponible} {producto?.unidad_venta}</td>
                  <td>{s.stock_minimo} {producto?.unidad_venta}</td>
                  <td><span className={`badge-${nivel}`}>{nivel}</span></td>
                  <td>
                    <form action={actualizarStockMinimo.bind(null, params.id)} className="flex gap-2">
                      <input type="hidden" name="sucursal_id" value={s.sucursal_id} />
                      <input name="stock_minimo" type="number" step="0.01" defaultValue={s.stock_minimo} className="input !w-24 !py-1" />
                      <button className="btn-secondary text-xs">Guardar</button>
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
