import { supabaseAdmin } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";

async function crearSucursal(formData: FormData) {
  "use server";
  const db = supabaseAdmin();
  const { data: sucursal } = await db.from("sucursales").insert({
    nombre: formData.get("nombre"),
    direccion: formData.get("direccion"),
    responsable: formData.get("responsable"),
  }).select().single();
  await registrarAuditoria({
    accion: "crear_sucursal",
    entidad: "sucursales",
    entidadId: sucursal?.id,
    detalle: { nombre: formData.get("nombre") },
  });
  revalidatePath("/dashboard/sucursales");
}

async function toggleActiva(id: string, activa: boolean) {
  "use server";
  const db = supabaseAdmin();
  await db.from("sucursales").update({ activa: !activa }).eq("id", id);
  await registrarAuditoria({
    accion: activa ? "desactivar_sucursal" : "activar_sucursal",
    entidad: "sucursales",
    entidadId: id,
  });
  revalidatePath("/dashboard/sucursales");
}

export default async function SucursalesPage() {
  const db = supabaseAdmin();
  const { data: sucursales } = await db.from("sucursales").select("*").order("created_at");

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow mb-1">Administración · 02</p>
        <h1 className="page-title">Sucursales</h1>
        <p className="page-subtitle">
          Cada sucursal tiene inventario independiente. El catálogo de productos, insumos y BOM es compartido. Para cambiar la tienda con la que trabajas, usa el selector arriba a la derecha.
        </p>
      </div>

      <div className="card">
        <h2 className="font-semibold mb-3">Nueva sucursal</h2>
        <form action={crearSucursal} className="grid md:grid-cols-3 gap-3">
          <div>
            <label className="label">Nombre</label>
            <input name="nombre" className="input" required />
          </div>
          <div>
            <label className="label">Dirección</label>
            <input name="direccion" className="input" />
          </div>
          <div>
            <label className="label">Responsable</label>
            <input name="responsable" className="input" />
          </div>
          <div className="md:col-span-3">
            <button className="btn-primary">Agregar sucursal</button>
          </div>
        </form>
      </div>

      <div className="card overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Dirección</th>
              <th>Responsable</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(sucursales || []).map((s: any) => (
              <tr key={s.id}>
                <td className="font-medium">{s.nombre}</td>
                <td>{s.direccion}</td>
                <td>{s.responsable}</td>
                <td>
                  <span className={s.activa ? "badge-verde" : "badge-rojo"}>
                    {s.activa ? "Activa" : "Inactiva"}
                  </span>
                </td>
                <td>
                  <form action={toggleActiva.bind(null, s.id, s.activa)}>
                    <button className="btn-secondary text-xs">
                      {s.activa ? "Desactivar" : "Activar"}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
