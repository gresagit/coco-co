import { supabaseAdmin } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";

async function agregarItemBom(formData: FormData) {
  "use server";
  const db = supabaseAdmin();
  const productoId = formData.get("producto_id") as string;
  const tipoInsumo = formData.get("tipo_insumo") as string; // "insumo" o "producto"
  const cantidad = Number(formData.get("cantidad_por_unidad"));
  const unidad = formData.get("unidad") as string;

  if (tipoInsumo === "insumo") {
    await db.from("bom").insert({
      producto_id: productoId,
      insumo_id: formData.get("insumo_id"),
      cantidad_por_unidad: cantidad,
      unidad,
    });
    await registrarAuditoria({
      accion: "agregar_componente_bom",
      entidad: "bom",
      entidadId: productoId,
      detalle: { tipo: "insumo", insumo_id: formData.get("insumo_id"), cantidad, unidad },
    });
  } else {
    const insumoProductoId = formData.get("insumo_producto_id") as string;
    if (insumoProductoId === productoId) {
      // evita que un producto se referencie a si mismo
      revalidatePath("/dashboard/bom");
      return;
    }
    await db.from("bom").insert({
      producto_id: productoId,
      insumo_producto_id: insumoProductoId,
      cantidad_por_unidad: cantidad,
      unidad,
    });
    await registrarAuditoria({
      accion: "agregar_componente_bom",
      entidad: "bom",
      entidadId: productoId,
      detalle: { tipo: "producto_anidado", insumo_producto_id: insumoProductoId, cantidad, unidad },
    });
  }
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
  const { data: insumos } = await db.from("insumos").select("id, codigo_interno, nombre, unidad_medida").order("nombre");
  const { data: productosIntermedios } = await db
    .from("productos")
    .select("id, sku, nombre")
    .eq("es_insumo_de_otro", true)
    .order("nombre");

  const productoSel = searchParams.producto || productos?.[0]?.id;

  const { data: items } = productoSel
    ? await db
        .from("bom")
        .select("*, insumos(nombre, unidad_medida), insumo_producto:insumo_producto_id(nombre, sku)")
        .eq("producto_id", productoSel)
    : { data: [] };

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow mb-1">Catálogo · 03</p>
        <h1 className="page-title">Fórmulas (BOM)</h1>
        <p className="page-subtitle">
          Define qué insumos —o qué otros productos (receta anidada)— componen cada producto terminado.
        </p>
      </div>

      <div className="card">
        <form method="get" className="flex gap-3 items-end">
          <div className="flex-1">
            <label className="label">Producto</label>
            <select name="producto" defaultValue={productoSel} className="input">
              {(productos || []).map((p: any) => (
                <option key={p.id} value={p.id}>{p.sku} — {p.nombre}</option>
              ))}
            </select>
          </div>
          <button className="btn-secondary">Ver fórmula</button>
        </form>
      </div>

      {productoSel && (
        <>
          <div className="card">
            <h2 className="font-semibold mb-3">Agregar componente a la fórmula</h2>
            <form action={agregarItemBom} className="grid md:grid-cols-4 gap-3 items-end">
              <input type="hidden" name="producto_id" value={productoSel} />
              <div>
                <label className="label">Tipo de componente</label>
                <select name="tipo_insumo" className="input" id="tipo_insumo">
                  <option value="insumo">Insumo del catálogo</option>
                  <option value="producto">Otro producto (receta anidada)</option>
                </select>
              </div>
              <div>
                <label className="label">Insumo</label>
                <select name="insumo_id" className="input">
                  {(insumos || []).map((i: any) => (
                    <option key={i.id} value={i.id}>{i.codigo_interno} — {i.nombre}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">— o Producto intermedio —</label>
                <select name="insumo_producto_id" className="input">
                  <option value="">— Ninguno —</option>
                  {(productosIntermedios || []).map((p: any) => (
                    <option key={p.id} value={p.id}>{p.sku} — {p.nombre}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Cantidad por unidad</label>
                <input name="cantidad_por_unidad" type="number" step="0.000001" className="input" required />
              </div>
              <div>
                <label className="label">Unidad</label>
                <input name="unidad" className="input" placeholder="kg, L, pz, m" required />
              </div>
              <div>
                <button className="btn-primary">Agregar</button>
              </div>
            </form>
            <p className="text-xs text-brand-500 mt-2">
              Si eliges "Otro producto", selecciona el producto en el segundo campo; el sistema calculará su costo
              recursivamente (útil para casos como hojuelas de jabón usadas dentro de otra receta).
            </p>
          </div>

          <div className="card overflow-x-auto">
            <h2 className="font-semibold mb-3">Componentes actuales</h2>
            <table className="table-base">
              <thead>
                <tr>
                  <th>Componente</th>
                  <th>Cantidad por unidad</th>
                  <th>Unidad</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {(items || []).map((it: any) => (
                  <tr key={it.id}>
                    <td>
                      {it.insumos?.nombre || (
                        <span>
                          {it.insumo_producto?.sku} — {it.insumo_producto?.nombre}{" "}
                          <span className="badge-amarillo">receta anidada</span>
                        </span>
                      )}
                    </td>
                    <td>{it.cantidad_por_unidad}</td>
                    <td>{it.unidad}</td>
                    <td>
                      <form action={eliminarItemBom.bind(null, it.id)}>
                        <button className="text-red-600 text-xs underline">Eliminar</button>
                      </form>
                    </td>
                  </tr>
                ))}
                {(items || []).length === 0 && (
                  <tr>
                    <td colSpan={4} className="text-brand-400 text-sm py-4">
                      Este producto todavía no tiene componentes en su fórmula.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
