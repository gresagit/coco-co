import { supabaseAdmin } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { calcularCostoProducto } from "@/lib/costeo";
import BomAgregarInsumo from "@/components/BomAgregarInsumo";

// Agrega un insumo del catálogo a la fórmula de un producto. La unidad NO se
// pide en el formulario: se toma directo de `insumos.unidad_medida` (casi
// siempre "kg"), así nunca hay inconsistencia entre lo que dice la fórmula y
// cómo está registrado el insumo.
async function agregarInsumoBom(formData: FormData) {
  "use server";
  const db = supabaseAdmin();
  const productoId = formData.get("producto_id") as string;
  const insumoId = formData.get("insumo_id") as string;
  const cantidad = Number(formData.get("cantidad_por_unidad"));

  if (!productoId || !insumoId || !cantidad || cantidad <= 0) {
    revalidatePath("/dashboard/bom");
    return;
  }

  const { data: insumo } = await db.from("insumos").select("unidad_medida, nombre").eq("id", insumoId).single();

  await db.from("bom").insert({
    producto_id: productoId,
    insumo_id: insumoId,
    cantidad_por_unidad: cantidad,
    unidad: insumo?.unidad_medida || "kg",
  });

  await registrarAuditoria({
    accion: "agregar_componente_bom",
    entidad: "bom",
    entidadId: productoId,
    detalle: { tipo: "insumo", insumo_id: insumoId, insumo_nombre: insumo?.nombre, cantidad, unidad: insumo?.unidad_medida },
  });

  revalidatePath("/dashboard/bom");
}

// Agrega otro producto como componente (receta anidada) — caso menos común,
// ej. hojuelas de jabón que se usan dentro de otra receta. La unidad se toma
// de `productos.unidad_venta` del producto usado como insumo.
async function agregarProductoAnidadoBom(formData: FormData) {
  "use server";
  const db = supabaseAdmin();
  const productoId = formData.get("producto_id") as string;
  const insumoProductoId = formData.get("insumo_producto_id") as string;
  const cantidad = Number(formData.get("cantidad_por_unidad_anidado"));

  if (!productoId || !insumoProductoId || !cantidad || cantidad <= 0 || insumoProductoId === productoId) {
    revalidatePath("/dashboard/bom");
    return;
  }

  const { data: prod } = await db.from("productos").select("unidad_venta, nombre").eq("id", insumoProductoId).single();

  await db.from("bom").insert({
    producto_id: productoId,
    insumo_producto_id: insumoProductoId,
    cantidad_por_unidad: cantidad,
    unidad: prod?.unidad_venta || "kg",
  });

  await registrarAuditoria({
    accion: "agregar_componente_bom",
    entidad: "bom",
    entidadId: productoId,
    detalle: { tipo: "producto_anidado", insumo_producto_id: insumoProductoId, producto_nombre: prod?.nombre, cantidad },
  });

  revalidatePath("/dashboard/bom");
}

async function eliminarItemBom(id: string) {
  "use server";
  const db = supabaseAdmin();
  await db.from("bom").delete().eq("id", id);
  await registrarAuditoria({
    accion: "eliminar_componente_bom",
    entidad: "bom",
    entidadId: id,
  });
  revalidatePath("/dashboard/bom");
}

export default async function BomPage({ searchParams }: { searchParams: { producto?: string } }) {
  const db = supabaseAdmin();
  const { data: productos } = await db.from("productos").select("id, sku, nombre").order("nombre");
  const { data: insumos } = await db
    .from("insumos")
    .select("id, codigo_interno, nombre, unidad_medida, costo_unitario_actual")
    .eq("activo", true)
    .order("nombre");
  const { data: productosIntermedios } = await db
    .from("productos")
    .select("id, sku, nombre, unidad_venta")
    .eq("es_insumo_de_otro", true)
    .order("nombre");

  const productoSel = searchParams.producto || productos?.[0]?.id;

  const { data: items } = productoSel
    ? await db
        .from("bom")
        .select("*, insumos(nombre, unidad_medida, costo_unitario_actual), insumo_producto:insumo_producto_id(nombre, sku)")
        .eq("producto_id", productoSel)
        .order("id")
    : { data: [] };

  const productoActual = (productos || []).find((p: any) => p.id === productoSel);
  const costoTotal = productoSel ? await calcularCostoProducto(productoSel) : 0;

  // Insumos que ya están en la fórmula, para no ofrecerlos de nuevo (evita
  // duplicados accidentales — si quieren cambiar la cantidad, primero quitan
  // el que está y agregan el nuevo, o les damos edición inline más adelante).
  const idsInsumosEnFormula = new Set((items || []).filter((it: any) => it.insumo_id).map((it: any) => it.insumo_id));
  const insumosDisponibles = (insumos || []).filter((i: any) => !idsInsumosEnFormula.has(i.id));

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow mb-1">Catálogo · 03</p>
        <h1 className="page-title">Fórmulas (BOM)</h1>
        <p className="page-subtitle">
          Elige un producto y define qué insumos —y en qué cantidad— se necesitan para fabricar una unidad.
        </p>
      </div>

      <div className="card">
        <form method="get" className="flex gap-3 items-end">
          <div className="flex-1">
            <label className="label">Producto</label>
            <select name="producto" defaultValue={productoSel} className="input">
              {(productos || []).map((p: any) => (
                <option key={p.id} value={p.id}>
                  {p.sku} — {p.nombre}
                </option>
              ))}
            </select>
          </div>
          <button className="btn-secondary">Ver fórmula</button>
        </form>
        {(productos || []).length === 0 && (
          <p className="text-sm text-brand-400 mt-3">
            Todavía no tienes productos. Crea uno primero en{" "}
            <a href="/dashboard/productos" className="underline">
              Producto terminado
            </a>
            .
          </p>
        )}
      </div>

      {productoSel && (
        <>
          <div className="card overflow-x-auto">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold">
                Fórmula de {productoActual?.sku} — {productoActual?.nombre}
              </h2>
              <span className="text-sm text-brand-500">
                Costo por unidad: <span className="font-semibold text-ink">${costoTotal.toFixed(2)}</span>
              </span>
            </div>
            <table className="table-base">
              <thead>
                <tr>
                  <th>Insumo</th>
                  <th>Cantidad por unidad</th>
                  <th>Unidad</th>
                  <th>Costo del componente</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {(items || []).map((it: any) => {
                  const costoComponente = it.insumos
                    ? Number(it.cantidad_por_unidad) * Number(it.insumos.costo_unitario_actual || 0)
                    : null;
                  return (
                    <tr key={it.id}>
                      <td>
                        {it.insumos?.nombre || (
                          <span>
                            {it.insumo_producto?.sku} — {it.insumo_producto?.nombre}{" "}
                            <span className="badge-amarillo">receta anidada</span>
                          </span>
                        )}
                      </td>
                      <td className="font-medium">{it.cantidad_por_unidad}</td>
                      <td className="text-brand-500">{it.unidad}</td>
                      <td className="text-brand-500">{costoComponente !== null ? `$${costoComponente.toFixed(2)}` : "—"}</td>
                      <td>
                        <form action={eliminarItemBom.bind(null, it.id)}>
                          <button className="text-red-600 dark:text-red-400 text-xs underline">Quitar</button>
                        </form>
                      </td>
                    </tr>
                  );
                })}
                {(items || []).length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-brand-400 text-sm py-4">
                      Este producto todavía no tiene ningún insumo en su fórmula. Agrega el primero abajo.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <BomAgregarInsumo
            productoId={productoSel}
            insumosDisponibles={insumosDisponibles}
            agregarInsumoBom={agregarInsumoBom}
          />

          <details className="card">
            <summary className="font-semibold cursor-pointer select-none">
              Opción avanzada: usar otro producto como componente (receta anidada)
            </summary>
            <p className="text-xs text-brand-500 mt-2 mb-3">
              Úsalo solo si este producto lleva, como componente, otro producto que tú mismo fabricas (ej. hojuelas de
              jabón usadas dentro de otra receta). El producto a usar debe estar marcado como "es insumo de otro" en su
              ficha.
            </p>
            <form action={agregarProductoAnidadoBom} className="grid md:grid-cols-3 gap-3 items-end">
              <input type="hidden" name="producto_id" value={productoSel} />
              <div>
                <label className="label">Producto componente</label>
                <select name="insumo_producto_id" className="input" required>
                  <option value="">— Selecciona —</option>
                  {(productosIntermedios || [])
                    .filter((p: any) => p.id !== productoSel)
                    .map((p: any) => (
                      <option key={p.id} value={p.id}>
                        {p.sku} — {p.nombre}
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label className="label">Cantidad por unidad</label>
                <input name="cantidad_por_unidad_anidado" type="number" step="0.000001" min="0.000001" className="input" required />
              </div>
              <div>
                <button className="btn-secondary">Agregar componente</button>
              </div>
            </form>
            {(productosIntermedios || []).length === 0 && (
              <p className="text-xs text-brand-400 mt-2">
                No hay productos marcados como "es insumo de otro" todavía.
              </p>
            )}
          </details>
        </>
      )}
    </div>
  );
}
