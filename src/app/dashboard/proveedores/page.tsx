import { supabaseAdmin } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";

async function crearProveedor(formData: FormData) {
  "use server";
  const db = supabaseAdmin();
  const condicionesPago = String(formData.get("condiciones_pago") || "");
  const { data: proveedor } = await db.from("proveedores").insert({
    nombre: formData.get("nombre"),
    contacto: formData.get("contacto"),
    telefono: formData.get("telefono"),
    email: formData.get("email"),
    tiempo_entrega_dias: Number(formData.get("tiempo_entrega_dias") || 0) || null,
    condiciones_pago: ["Transferencia bancaria", "Deposito", "Efectivo"].includes(condicionesPago)
      ? condicionesPago
      : "Transferencia bancaria",
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

async function actualizarProveedor(formData: FormData) {
  "use server";
  const db = supabaseAdmin();
  const proveedorId = formData.get("proveedor_id") as string;
  const condicionesPago = String(formData.get("condiciones_pago") || "");
  const payload = {
    nombre: (formData.get("nombre") as string)?.trim() || null,
    contacto: (formData.get("contacto") as string)?.trim() || null,
    telefono: (formData.get("telefono") as string)?.trim() || null,
    email: (formData.get("email") as string)?.trim() || null,
    tiempo_entrega_dias: Number(formData.get("tiempo_entrega_dias") || 0) || null,
    condiciones_pago: ["Transferencia bancaria", "Deposito", "Efectivo"].includes(condicionesPago)
      ? condicionesPago
      : null,
    pedido_minimo: Number(formData.get("pedido_minimo") || 0) || null,
  };

  const { error } = await db.from("proveedores").update(payload).eq("id", proveedorId);
  if (error) {
    throw new Error("No se pudo actualizar el proveedor.");
  }

  await registrarAuditoria({
    accion: "editar_proveedor",
    entidad: "proveedores",
    entidadId: proveedorId,
    detalle: payload,
  });

  revalidatePath("/dashboard/proveedores");
}

async function eliminarProveedor(formData: FormData) {
  "use server";
  const db = supabaseAdmin();
  const proveedorId = formData.get("proveedor_id") as string;
  if (!proveedorId) return;

  await db.from("insumo_proveedores").delete().eq("proveedor_id", proveedorId);
  const { error } = await db.from("proveedores").delete().eq("id", proveedorId);
  if (error) {
    throw new Error("No se pudo eliminar el proveedor.");
  }

  await registrarAuditoria({
    accion: "eliminar_proveedor",
    entidad: "proveedores",
    entidadId: proveedorId,
  });

  revalidatePath("/dashboard/proveedores");
}

export default async function ProveedoresPage({ searchParams }: { searchParams?: { categoria?: string; editar?: string } }) {
  const db = supabaseAdmin();
  const categoriaSeleccionada = String(searchParams?.categoria || "");
  const editarId = String(searchParams?.editar || "");

  const [{ data: proveedores }, { data: insumos }, { data: relaciones }] = await Promise.all([
    db.from("proveedores").select("*").order("nombre"),
    db.from("insumos").select("id, codigo_interno, nombre, tipo").eq("activo", true).order("nombre"),
    db.from("insumo_proveedores").select("*, insumos(nombre), proveedores(nombre)"),
  ]);

  const categoriasInsumos = Array.from(new Set((insumos || []).map((i: any) => i.tipo).filter(Boolean))).sort();
  const insumosFiltrados = (insumos || []).filter((i: any) => !categoriaSeleccionada || i.tipo === categoriaSeleccionada);
  const proveedorEnEdicion = editarId
    ? (proveedores || []).find((p: any) => p.id === editarId)
    : null;

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
          <div><label className="label">Nombre de Empresa</label><input name="nombre" className="input" required /></div>
          <div><label className="label">Nombre del Encargado</label><input name="contacto" className="input" /></div>
          <div><label className="label">Teléfono</label><input name="telefono" className="input" /></div>
          <div><label className="label">Email</label><input name="email" type="email" className="input" /></div>
          <div><label className="label">Tiempo de entrega (días)</label><input name="tiempo_entrega_dias" type="number" className="input" /></div>
          <div><label className="label">Pedido mínimo ($)</label><input name="pedido_minimo" type="number" step="0.01" className="input" /></div>
          <div className="md:col-span-3">
            <label className="label">Condiciones de pago</label>
            <select name="condiciones_pago" className="input" defaultValue="Transferencia bancaria" required>
              <option value="Transferencia bancaria">Transferencia bancaria</option>
              <option value="Deposito">Deposito</option>
              <option value="Efectivo">Efectivo</option>
            </select>
          </div>
          <div className="md:col-span-3"><button className="btn-primary">Agregar proveedor</button></div>
        </form>
      </div>

      <div className="card">
        <div className="flex flex-wrap items-end gap-3 mb-4">
          <form method="get" action="/dashboard/proveedores" className="flex flex-wrap items-end gap-3">
            <div>
              <label className="label">Filtrar insumos por categoría</label>
              <select name="categoria" className="input" defaultValue={categoriaSeleccionada}>
                <option value="">Todas</option>
                {(categoriasInsumos || []).map((cat: string) => <option key={cat} value={cat}>{cat}</option>)}
              </select>
            </div>
            <button className="btn-secondary">Aplicar</button>
            {(categoriaSeleccionada || "").length > 0 && <a href="/dashboard/proveedores" className="btn-secondary">Quitar filtro</a>}
          </form>
        </div>
        <h2 className="font-semibold mb-3">Asociar insumo a proveedor</h2>
        <form action={asociarInsumo} className="grid md:grid-cols-5 gap-3 items-end">
          <div>
            <label className="label">Proveedor</label>
            <select name="proveedor_id" className="input" required>
              {(proveedores || []).map((p: any) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="label">Insumo</label>
            <select name="insumo_id" className="input" required>
              {(insumosFiltrados || []).map((i: any) => <option key={i.id} value={i.id}>{i.codigo_interno} — {i.nombre} ({i.tipo})</option>)}
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
          <div className="md:col-span-5"><button className="btn-primary">Asociar</button></div>
        </form>
      </div>

      <div className="card overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th>Nombre de Empresa</th>
              <th>Nombre del Encargado</th>
              <th>Teléfono</th>
              <th>Email</th>
              <th>Tiempo entrega</th>
              <th>Pedido mínimo</th>
              <th>Condiciones</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {(proveedores || []).map((p: any) => (
              <tr key={p.id}>
                <td className="font-medium">{p.nombre}</td>
                <td>{p.contacto || "—"}</td>
                <td>{p.telefono || "—"}</td>
                <td>{p.email || "—"}</td>
                <td>{p.tiempo_entrega_dias ? `${p.tiempo_entrega_dias} días` : "—"}</td>
                <td>{p.pedido_minimo ? `$${p.pedido_minimo}` : "—"}</td>
                <td>{p.condiciones_pago || "—"}</td>
                <td className="whitespace-nowrap">
                  <div className="flex flex-wrap gap-2">
                    <a href={`/dashboard/proveedores?editar=${p.id}`} className="btn-secondary text-xs">Editar</a>
                    <form action={eliminarProveedor} className="inline">
                      <input type="hidden" name="proveedor_id" value={p.id} />
                      <button type="submit" className="btn-secondary !border-red-200 !text-red-600 text-xs">Eliminar</button>
                    </form>
                  </div>
                  {proveedorEnEdicion?.id === p.id && (
                    <form action={actualizarProveedor} className="mt-3 flex flex-wrap items-end gap-2">
                      <input type="hidden" name="proveedor_id" value={p.id} />
                      <div><label className="label">Empresa</label><input name="nombre" className="input" defaultValue={p.nombre} required /></div>
                      <div><label className="label">Encargado</label><input name="contacto" className="input" defaultValue={p.contacto || ""} /></div>
                      <div><label className="label">Teléfono</label><input name="telefono" className="input" defaultValue={p.telefono || ""} /></div>
                      <div><label className="label">Email</label><input name="email" type="email" className="input" defaultValue={p.email || ""} /></div>
                      <div><label className="label">Entrega</label><input name="tiempo_entrega_dias" type="number" className="input" defaultValue={p.tiempo_entrega_dias || ""} /></div>
                      <div><label className="label">Pedido mínimo</label><input name="pedido_minimo" type="number" step="0.01" className="input" defaultValue={p.pedido_minimo || ""} /></div>
                      <div>
                        <label className="label">Pago</label>
                        <select name="condiciones_pago" className="input" defaultValue={p.condiciones_pago || "Transferencia bancaria"}>
                          <option value="Transferencia bancaria">Transferencia bancaria</option>
                          <option value="Deposito">Deposito</option>
                          <option value="Efectivo">Efectivo</option>
                        </select>
                      </div>
                      <div><button className="btn-primary">Guardar</button></div>
                    </form>
                  )}
                </td>
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
