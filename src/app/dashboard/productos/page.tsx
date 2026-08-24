import { supabaseAdmin } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { calcularCostoProducto, precioSugerido } from "@/lib/costeo";
import { siguienteSkuProducto } from "@/lib/sku";
import { getSucursalActualId } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria";
import type { SVGProps } from "react";
import CollapsePanel from "@/components/CollapsePanel";
import EscanerInventario from "@/components/EscanerInventario";
import ProductosTabla from "@/components/ProductosTabla";

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

    await registrarAuditoria({
      accion: "crear_producto",
      entidad: "productos",
      entidadId: producto.id,
      detalle: { sku: producto.sku, nombre: producto.nombre, categoria: categoriaNombre },
    });
  }
  revalidatePath("/dashboard/productos");
}

// Edita nombre, categoría (permite crear una nueva al vuelo) y margen deseado
// de un producto ya existente. Se usa desde el modal "Editar" de la tabla.
async function editarProducto(formData: FormData) {
  "use server";
  const db = supabaseAdmin();
  const productoId = formData.get("producto_id") as string;
  if (!productoId) return;

  const nombre = (formData.get("nombre") as string)?.trim();
  let categoriaId = formData.get("categoria_id") as string;
  const categoriaNueva = (formData.get("categoria_nueva") as string)?.trim();
  const margenRaw = formData.get("margen") as string;

  if (categoriaNueva) {
    // Si ya existe una categoría con ese nombre (sin importar mayúsculas), la
    // reutiliza en vez de crear un duplicado.
    const { data: existente } = await db
      .from("categorias")
      .select("id")
      .ilike("nombre", categoriaNueva)
      .maybeSingle();

    if (existente) {
      categoriaId = existente.id;
    } else {
      const { data: cat } = await db.from("categorias").insert({ nombre: categoriaNueva }).select().single();
      if (cat) {
        categoriaId = cat.id;
        await registrarAuditoria({
          accion: "crear_categoria",
          entidad: "categorias",
          entidadId: cat.id,
          detalle: { nombre: categoriaNueva, origen: "edición de producto" },
        });
      }
    }
  }

  const cambios: Record<string, unknown> = {};
  if (nombre) cambios.nombre = nombre;
  if (categoriaId) cambios.categoria_id = categoriaId;
  if (margenRaw !== null && margenRaw !== "") cambios.porcentaje_margen_deseado = Number(margenRaw);

  if (Object.keys(cambios).length > 0) {
    await db.from("productos").update(cambios).eq("id", productoId);
    await registrarAuditoria({
      accion: "editar_producto",
      entidad: "productos",
      entidadId: productoId,
      detalle: cambios,
    });
  }

  revalidatePath("/dashboard/productos");
  revalidatePath(`/dashboard/productos/${productoId}`);
}

export default async function ProductosPage() {
  const db = supabaseAdmin();
  const sucursalId = getSucursalActualId();

  const [{ data: productos }, { data: categorias }, { data: stockRows }] = await Promise.all([
    db.from("productos").select("*, categorias(nombre)").order("nombre"),
    db.from("categorias").select("*").order("nombre"),
    sucursalId
      ? db.from("producto_stock").select("producto_id, cantidad_disponible").eq("sucursal_id", sucursalId)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const stockPorProducto: Record<string, number> = {};
  for (const row of stockRows || []) {
    stockPorProducto[row.producto_id] = Number(row.cantidad_disponible);
  }

  const conCosteo = await Promise.all(
    (productos || []).map(async (p: any) => {
      const costo = await calcularCostoProducto(p.id);
      const precio = p.precio_venta_override ?? precioSugerido(costo, Number(p.porcentaje_margen_deseado));
      return { ...p, costo, precio, stock: stockPorProducto[p.id] ?? 0 };
    })
  );

  const stockPorCategoria: Record<string, number> = {};
  for (const p of conCosteo) {
    const nombre = p.categorias?.nombre || "Sin categoría";
    stockPorCategoria[nombre] = (stockPorCategoria[nombre] || 0) + p.stock;
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow mb-1">Catálogo · 01</p>
        <h1 className="page-title">Producto terminado</h1>
        <p className="page-subtitle">
          El SKU se genera automáticamente a partir de la categoría. Costo y precio sugerido se calculan a partir del BOM.
        </p>
      </div>

      <CollapsePanel
        title="Escanear código de barras"
        description="Suma stock al instante con un lector Bluetooth o la cámara del teléfono."
        icon={<IconScan className="w-[18px] h-[18px]" />}
      >
        <EscanerInventario embedded />
      </CollapsePanel>

      {sucursalId && Object.keys(stockPorCategoria).length > 0 && (
        <div className="banner">
          <h2 className="font-semibold mb-3">Stock por categoría — esta sucursal</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Object.entries(stockPorCategoria).map(([nombre, cantidad]) => (
              <div key={nombre} className="rounded-lg border border-brand-150 bg-surface px-3 py-2.5 transition-transform hover:-translate-y-0.5">
                <p className="text-xs text-brand-400 uppercase tracking-wide truncate">{nombre}</p>
                <p className="font-serif text-2xl text-ink mt-0.5">{cantidad}</p>
              </div>
            ))}
          </div>
        </div>
      )}

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

      <ProductosTabla productos={conCosteo} categorias={categorias || []} editarProducto={editarProducto} />
    </div>
  );
}

function IconScan(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} {...props}>
      <path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 12h16" strokeLinecap="round" />
    </svg>
  );
}
