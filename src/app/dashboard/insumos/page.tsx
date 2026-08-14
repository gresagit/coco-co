import { supabaseAdmin } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import Link from "next/link";
import { siguienteCodigoInsumo } from "@/lib/sku";

async function crearInsumo(formData: FormData) {
  "use server";
  const db = supabaseAdmin();
  const tipo = formData.get("tipo") as string;
  // El código interno se genera automáticamente a partir del tipo de insumo.
  const codigoInterno = await siguienteCodigoInsumo(tipo);

  const { data: insumo, error } = await db
    .from("insumos")
    .insert({
      codigo_interno: codigoInterno,
      nombre: formData.get("nombre"),
      tipo,
      unidad_medida: formData.get("unidad_medida"),
      controla_caducidad: formData.get("controla_caducidad") === "on",
      costo_unitario_actual: Number(formData.get("costo_unitario_actual") || 0),
    })
    .select()
    .single();

  if (!error && insumo) {
    // Crea fila de stock (0) en todas las sucursales activas
    const { data: sucursales } = await db.from("sucursales").select("id").eq("activa", true);
    if (sucursales?.length) {
      await db.from("insumo_stock").insert(
        sucursales.map((s: any) => ({ insumo_id: insumo.id, sucursal_id: s.id, stock_minimo: 0, cantidad_disponible: 0 }))
      );
    }
  }
  revalidatePath("/dashboard/insumos");
}

export default async function InsumosPage() {
  const db = supabaseAdmin();
  const { data: insumos } = await db.from("insumos").select("*").order("nombre");

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow mb-1">Catálogo · 02</p>
        <h1 className="page-title">Insumos</h1>
        <p className="page-subtitle">
          Materia prima, empaque, etiquetas y productos intermedios. El código interno se genera automáticamente según el tipo.
        </p>
      </div>

      <div className="card">
        <h2 className="font-semibold mb-3">Nuevo insumo</h2>
        <form action={crearInsumo} className="grid md:grid-cols-3 gap-3">
          <div>
            <label className="label">Nombre</label>
            <input name="nombre" className="input" required />
          </div>
          <div>
            <label className="label">Tipo</label>
            <select name="tipo" className="input" required>
              <option>Materia Prima</option>
              <option>Empaque</option>
              <option>Etiqueta</option>
              <option>Producto Intermedio</option>
            </select>
            <p className="text-xs text-brand-400 mt-1">Define el prefijo del código (ej. Empaque → EMP-0001).</p>
          </div>
          <div>
            <label className="label">Unidad de medida</label>
            <select name="unidad_medida" className="input" required>
              <option value="kg">kg</option>
              <option value="L">L</option>
              <option value="pz">pz</option>
              <option value="m">m</option>
            </select>
          </div>
          <div>
            <label className="label">Costo unitario actual</label>
            <input name="costo_unitario_actual" type="number" step="0.0001" className="input" defaultValue={0} />
          </div>
          <div className="flex items-center gap-2 pt-6">
            <input type="checkbox" name="controla_caducidad" id="cad" />
            <label htmlFor="cad" className="text-sm">¿Controla caducidad? (activa FEFO)</label>
          </div>
          <div className="md:col-span-3">
            <button className="btn-primary">Agregar insumo</button>
          </div>
        </form>
      </div>

      <div className="card overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th>Código</th>
              <th>Nombre</th>
              <th>Tipo</th>
              <th>Unidad</th>
              <th>Caducidad</th>
              <th>Costo actual</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(insumos || []).map((i: any) => (
              <tr key={i.id}>
                <td className="font-mono text-xs">{i.codigo_interno}</td>
                <td className="font-medium">{i.nombre}</td>
                <td>{i.tipo}</td>
                <td>{i.unidad_medida}</td>
                <td>{i.controla_caducidad ? <span className="badge-amarillo">FEFO</span> : "—"}</td>
                <td>${Number(i.costo_unitario_actual).toFixed(4)}</td>
                <td>
                  <Link href={`/dashboard/insumos/${i.id}/stock`} className="text-brand-600 text-xs underline">
                    Ver stock por sucursal
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
