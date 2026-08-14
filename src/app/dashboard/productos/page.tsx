import { supabaseAdmin } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import Link from "next/link";
import { calcularCostoProducto, precioSugerido } from "@/lib/costeo";
import { siguienteSkuProducto } from "@/lib/sku";

async function crearProducto(formData: FormData) {
  "use server";
  const db = supabaseAdmin();
  let categoriaId = formData.get("categoria_id") as string;
  const categoriaNueva = (formData.get("categoria_nueva") as string)?.trim();
  let categoriaNombre = categoriaNueva || null;

  if (!categoriaId && categoriaNueva) {
    const { data: cat } = await db.from("categorias").insert({ nombre: categoriaNueva }).select().single();
    categoriaId = cat?.id;
  } else if (categoriaId) {
    const { data: cat } = await db.from("categorias").select("nombre").eq("id", categoriaId).maybeSingle();
    categoriaNombre = cat?.nombre || null;
  }

  // El SKU se genera automáticamente a partir de la categoría — el usuario no lo escribe.
  const sku = await siguienteSkuProducto(categoriaNombre);

  const { data: producto, error } = await db
    .from("productos")
    .insert({
      sku,
      nombre: formData.get("nombre"),
      categoria_id: categoriaId || null,
      presentacion: formData.get("presentacion"),
      unidad_venta: formData.get("unidad_venta"),
      porcentaje_margen_deseado: Number(formData.get("margen") || 0.3),
      es_insumo_de_otro: formData.get("es_insumo_de_otro") === "on",
    })
    .select()
    .single();

  if (!error && producto) {
    // Prefijo de folio: primeras 3 letras del SKU antes del primer guión, o el SKU completo
    const prefijo = sku.split("-")[0].toUpperCase();
    await db.from("folio_contadores").insert({ producto_id: producto.id, prefijo, ultimo_numero: 0 });

    const { data: sucursales } = await db.from("sucursales").select("id").eq("activa", true);
    if (sucursales?.length) {
      await db.from("producto_stock").insert(
        sucursales.map((s: any) => ({ producto_id: producto.id, sucursal_id: s.id, stock_minimo: 0, cantidad_disponible: 0 }))
      );
    }
  }
  revalidatePath("/dashboard/productos");
}

export default async function ProductosPage() {
  const db = supabaseAdmin();
  const { data: productos } = await db
    .from("productos")
    .select("*, categorias(nombre)")
    .order("nombre");
  const { data: categorias } = await db.from("categorias").select("*").order("nombre");

  const conCosteo = await Promise.all(
    (productos || []).map(async (p: any) => {
      const costo = await calcularCostoProducto(p.id);
      const precio = p.precio_venta_override ?? precioSugerido(costo, Number(p.porcentaje_margen_deseado));
      return { ...p, costo, precio };
    })
  );

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow mb-1">Catálogo · 01</p>
        <h1 className="page-title">Producto terminado</h1>
        <p className="page-subtitle">
          El SKU se genera automáticamente a partir de la categoría. Costo y precio sugerido se calculan a partir del BOM.
        </p>
      </div>

      <div className="card">
        <h2 className="font-semibold mb-3">Nuevo producto</h2>
        <form action={crearProducto} className="grid md:grid-cols-3 gap-3">
          <div>
            <label className="label">Nombre</label>
            <input name="nombre" className="input" required />
          </div>
          <div>
            <label className="label">Categoría existente</label>
            <select name="categoria_id" className="input">
              <option value="">— Ninguna —</option>
              {(categorias || []).map((c: any) => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">O nueva categoría</label>
            <input name="categoria_nueva" className="input" placeholder="Ej. Jabones" />
            <p className="text-xs text-brand-400 mt-1">La categoría define el prefijo del SKU (ej. Jabones → JAB-0001).</p>
          </div>
          <div>
            <label className="label">Presentación / tamaño</label>
            <input name="presentacion" className="input" required />
          </div>
          <div>
            <label className="label">Unidad de venta</label>
            <select name="unidad_venta" className="input" required>
              <option value="pz">pz</option>
              <option value="kg">kg</option>
              <option value="L">L</option>
            </select>
          </div>
          <div>
            <label className="label">% Margen deseado (ej. 0.30 = 30%)</label>
            <input name="margen" type="number" step="0.01" min="0" max="0.99" defaultValue={0.3} className="input" />
          </div>
          <div className="flex items-center gap-2 pt-6">
            <input type="checkbox" name="es_insumo_de_otro" id="anidado" />
            <label htmlFor="anidado" className="text-sm">¿Es también insumo de otro producto?</label>
          </div>
          <div className="md:col-span-3">
            <button className="btn-primary">Agregar producto</button>
          </div>
        </form>
      </div>

      <div className="card overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th>SKU</th>
              <th>Nombre</th>
              <th>Categoría</th>
              <th>Costo (auto)</th>
              <th>Precio sugerido</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {conCosteo.map((p: any) => (
              <tr key={p.id}>
                <td className="font-mono text-xs">{p.sku}</td>
                <td className="font-medium">{p.nombre}</td>
                <td>{p.categorias?.nombre || "—"}</td>
                <td>${p.costo.toFixed(2)}</td>
                <td>
                  ${p.precio.toFixed(2)}
                  {p.precio_venta_override && <span className="text-xs text-brand-400 ml-1">(manual)</span>}
                </td>
                <td className="space-x-3">
                  <Link href={`/dashboard/productos/${p.id}`} className="text-brand-600 text-xs underline">
                    Detalle / stock
                  </Link>
                  <Link href={`/dashboard/bom?producto=${p.id}`} className="text-brand-600 text-xs underline">
                    Editar fórmula
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
