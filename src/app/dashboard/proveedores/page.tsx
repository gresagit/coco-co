import { supabaseAdmin } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";

async function crearProveedor(formData: FormData) {
  "use server";
  const db = supabaseAdmin();
  const { data: proveedor } = await db.from("proveedores").insert({
    nombre: formData.get("nombre"),
    contacto: formData.get("contacto"),
    telefono: formData.get("telefono"),
    email: formData.get("email"),
    tiempo_entrega_dias: Number(formData.get("tiempo_entrega_dias") || 0) || null,
    condiciones_pago: formData.get("condiciones_pago"),
    pedido_minimo: Number(formData.get("pedido_minimo") || 0) || null,
  }).select().single();
  await registrarAuditoria({
    accion: "crear_proveedor",
    entidad: "proveedores",
    entidadId: proveedor?.id,
    detalle: { nombre: formData.get("nombre") },
  });
  revalidatePath("/dashboard/proveedores");
}

async function asociarInsumo(formData: FormData) {
  "use server";
  const db = supabaseAdmin();
  await db.from("insumo_proveedores").upsert({
    proveedor_id: formData.get("proveedor_id"),
    insumo_id: formData.get("insumo_id"),
    precio_historico: Number(formData.get("precio_historico") || 0) || null,
    es_preferido: formData.get("es_preferido") === "on",
  });
  await registrarAuditoria({
    accion: "asociar_insumo_proveedor",
    entidad: "insumo_proveedores",
    detalle: { proveedor_id: formData.get("proveedor_id"), insumo_id: formData.get("insumo_id") },
  });
  revalidatePath("/dashboard/proveedores");
}

export default async function ProveedoresPage() {
  const db = supabaseAdmin();
  const { data: proveedores } = await db.from("proveedores").select("*").order("nombre");
  const { data: insumos } = await db.from("insumos").select("id, codigo_interno, nombre").order("nombre");
  const { data: relaciones } = await db
    .from("insumo_proveedores")
    .select("*, insumos(nombre), proveedores(nombre)");

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow mb-1">Compras · 01</p>
        <h1 className="page-title">Proveedores</h1>
        <p className="page-subtitle">Perfil de proveedores e insumos que suministran.</p>
      </div>

      <div className="card">
        <h2 className="font-semibold mb-3">Nuevo proveedor</h2>
        <form action={crearProveedor} className="grid md:grid-cols-3 gap-3">
          <div><label className="label">Nombre</label><input name="nombre" className="input" required /></div>
          <div><label className="label">Contacto</label><input name="contacto" className="input" /></div>
          <div><label className="label">Teléfono</label><input name="telefono" className="input" /></div>
          <div><label className="label">Email</label><input name="email" type="email" className="input" /></div>
          <div><label className="label">Tiempo de entrega (días)</label><input name="tiempo_entrega_dias" type="number" className="input" /></div>
          <div><label className="label">Pedido mínimo ($)</label><input name="pedido_minimo" type="number" step="0.01" className="input" /></div>
          <div className="md:col-span-3"><label className="label">Condiciones de pago</label><input name="condiciones_pago" className="input" placeholder="Ej. Contado, 30 días, etc." /></div>
          <div className="md:col-span-3"><button className="btn-primary">Agregar proveedor</button></div>
        </form>
      </div>

      <div className="card">
        <h2 className="font-semibold mb-3">Asociar insumo a proveedor</h2>
        <form action={asociarInsumo} className="grid md:grid-cols-4 gap-3 items-end">
          <div>
            <label className="label">Proveedor</label>
            <select name="proveedor_id" className="input" required>
              {(proveedores || []).map((p: any) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Insumo</label>
            <select name="insumo_id" className="input" required>
              {(insumos || []).map((i: any) => <option key={i.id} value={i.id}>{i.codigo_interno} — {i.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Precio histórico</label>
            <input name="precio_historico" type="number" step="0.0001" className="input" />
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" name="es_preferido" id="pref" />
            <label htmlFor="pref" className="text-sm">Preferido</label>
          </div>
          <div className="md:col-span-4"><button className="btn-primary">Asociar</button></div>
        </form>
      </div>

      <div className="card overflow-x-auto">
        <table className="table-base">
          <thead><tr><th>Nombre</th><th>Contacto</th><th>Tiempo entrega</th><th>Pedido mínimo</th><th>Condiciones</th></tr></thead>
          <tbody>
            {(proveedores || []).map((p: any) => (
              <tr key={p.id}>
                <td className="font-medium">{p.nombre}</td>
                <td>{p.contacto} {p.telefono && `· ${p.telefono}`}</td>
                <td>{p.tiempo_entrega_dias ? `${p.tiempo_entrega_dias} días` : "—"}</td>
                <td>{p.pedido_minimo ? `$${p.pedido_minimo}` : "—"}</td>
                <td>{p.condiciones_pago || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card overflow-x-auto">
        <h2 className="font-semibold mb-3">Insumos por proveedor</h2>
        <table className="table-base">
          <thead><tr><th>Insumo</th><th>Proveedor</th><th>Precio histórico</th><th>Preferido</th></tr></thead>
          <tbody>
            {(relaciones || []).map((r: any, i: number) => (
              <tr key={i}>
                <td>{r.insumos?.nombre}</td>
                <td>{r.proveedores?.nombre}</td>
                <td>{r.precio_historico ? `$${r.precio_historico}` : "—"}</td>
                <td>{r.es_preferido ? <span className="badge-verde">Sí</span> : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
