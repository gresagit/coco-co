import { supabaseAdmin } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";

async function crearUsuario(formData: FormData) {
  "use server";
  const db = supabaseAdmin();
  const password = formData.get("password") as string;
  const hash = await bcrypt.hash(password, 10);

  const { data: usuario, error } = await db
    .from("usuarios")
    .insert({
      usuario: formData.get("usuario"),
      nombre_completo: formData.get("nombre_completo"),
      password_hash: hash,
      acceso_todas_sucursales: formData.get("acceso_todas") === "on",
    })
    .select()
    .single();

  if (!error && usuario) {
    const rolId = formData.get("rol_id") as string;
    if (rolId) await db.from("usuario_roles").insert({ usuario_id: usuario.id, rol_id: rolId });

    const sucursalIds = formData.getAll("sucursal_id") as string[];
    if (sucursalIds.length && formData.get("acceso_todas") !== "on") {
      await db.from("usuario_sucursales").insert(sucursalIds.map((sid) => ({ usuario_id: usuario.id, sucursal_id: sid })));
    }
  }
  revalidatePath("/dashboard/usuarios");
}

async function cambiarPassword(usuarioId: string, formData: FormData) {
  "use server";
  const db = supabaseAdmin();
  const nueva = formData.get("password_nueva") as string;
  if (!nueva || nueva.length < 4) return;
  const hash = await bcrypt.hash(nueva, 10);
  await db.from("usuarios").update({ password_hash: hash }).eq("id", usuarioId);
  revalidatePath("/dashboard/usuarios");
}

async function toggleActivo(usuarioId: string, activo: boolean) {
  "use server";
  const db = supabaseAdmin();
  await db.from("usuarios").update({ activo: !activo }).eq("id", usuarioId);
  revalidatePath("/dashboard/usuarios");
}

async function crearRolPersonalizado(formData: FormData) {
  "use server";
  const db = supabaseAdmin();
  await db.from("roles").insert({
    nombre: formData.get("nombre"),
    es_base: false,
    temporal: formData.get("temporal") === "on",
    vigente_desde: formData.get("vigente_desde") || null,
    vigente_hasta: formData.get("vigente_hasta") || null,
    permisos: {},
  });
  revalidatePath("/dashboard/usuarios");
}

export default async function UsuariosPage() {
  const db = supabaseAdmin();
  const { data: usuarios } = await db.from("usuarios").select("*").order("created_at");
  const { data: roles } = await db.from("roles").select("*").order("nombre");
  const { data: sucursales } = await db.from("sucursales").select("*").eq("activa", true).order("nombre");
  const { data: usuarioRoles } = await db.from("usuario_roles").select("usuario_id, roles(nombre)");

  const rolesPorUsuario: Record<string, string[]> = {};
  (usuarioRoles || []).forEach((ur: any) => {
    if (!rolesPorUsuario[ur.usuario_id]) rolesPorUsuario[ur.usuario_id] = [];
    rolesPorUsuario[ur.usuario_id].push(ur.roles?.nombre);
  });

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow mb-1">Administración · 03</p>
        <h1 className="page-title">Usuarios, roles y permisos</h1>
        <p className="page-subtitle">Roles base + perfiles personalizados/temporales, acotables por sucursal.</p>
      </div>

      <div className="card">
        <h2 className="font-semibold mb-3">Nuevo usuario</h2>
        <form action={crearUsuario} className="grid md:grid-cols-3 gap-3">
          <div><label className="label">Usuario (login)</label><input name="usuario" className="input" required /></div>
          <div><label className="label">Nombre completo</label><input name="nombre_completo" className="input" required /></div>
          <div><label className="label">Contraseña</label><input name="password" type="password" className="input" required /></div>
          <div>
            <label className="label">Rol</label>
            <select name="rol_id" className="input">
              {(roles || []).map((r: any) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2 pt-6">
            <input type="checkbox" name="acceso_todas" id="todas" />
            <label htmlFor="todas" className="text-sm">Acceso a todas las sucursales</label>
          </div>
          <div>
            <label className="label">O sucursales específicas</label>
            <select name="sucursal_id" multiple className="input h-24">
              {(sucursales || []).map((s: any) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
          </div>
          <div className="md:col-span-3"><button className="btn-primary">Crear usuario</button></div>
        </form>
      </div>

      <div className="card">
        <h2 className="font-semibold mb-3">Nuevo rol / perfil personalizado o temporal</h2>
        <form action={crearRolPersonalizado} className="grid md:grid-cols-4 gap-3 items-end">
          <div><label className="label">Nombre del rol</label><input name="nombre" className="input" placeholder="Ej. Becaria Verano 2026" required /></div>
          <div className="flex items-center gap-2 pb-2">
            <input type="checkbox" name="temporal" id="temporal" />
            <label htmlFor="temporal" className="text-sm">Es temporal</label>
          </div>
          <div><label className="label">Vigente desde</label><input name="vigente_desde" type="date" className="input" /></div>
          <div><label className="label">Vigente hasta</label><input name="vigente_hasta" type="date" className="input" /></div>
          <div className="md:col-span-4"><button className="btn-primary">Crear rol</button></div>
        </form>
        <p className="text-xs text-brand-500 mt-2">
          Los permisos granulares por módulo/acción se definen editando la columna JSON <code>permisos</code> del rol
          (directamente en Supabase o desde una futura pantalla de detalle de rol).
        </p>
      </div>

      <div className="card overflow-x-auto">
        <h2 className="font-semibold mb-3">Usuarios</h2>
        <table className="table-base">
          <thead><tr><th>Usuario</th><th>Nombre</th><th>Roles</th><th>Estado</th><th>Cambiar contraseña</th><th></th></tr></thead>
          <tbody>
            {(usuarios || []).map((u: any) => (
              <tr key={u.id}>
                <td className="font-mono text-xs">{u.usuario}</td>
                <td>{u.nombre_completo}</td>
                <td>{(rolesPorUsuario[u.id] || []).join(", ") || "—"}</td>
                <td><span className={u.activo ? "badge-verde" : "badge-rojo"}>{u.activo ? "Activo" : "Inactivo"}</span></td>
                <td>
                  <form action={cambiarPassword.bind(null, u.id)} className="flex gap-2">
                    <input name="password_nueva" type="password" placeholder="Nueva contraseña" className="input !w-40 !py-1" />
                    <button className="btn-secondary text-xs">Cambiar</button>
                  </form>
                </td>
                <td>
                  <form action={toggleActivo.bind(null, u.id, u.activo)}>
                    <button className="btn-secondary text-xs">{u.activo ? "Desactivar" : "Activar"}</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card overflow-x-auto">
        <h2 className="font-semibold mb-3">Roles</h2>
        <table className="table-base">
          <thead><tr><th>Nombre</th><th>Base / Personalizado</th><th>Temporal</th><th>Vigencia</th></tr></thead>
          <tbody>
            {(roles || []).map((r: any) => (
              <tr key={r.id}>
                <td className="font-medium">{r.nombre}</td>
                <td>{r.es_base ? "Base" : "Personalizado"}</td>
                <td>{r.temporal ? "Sí" : "No"}</td>
                <td>{r.vigente_desde || "—"} {r.vigente_hasta ? `→ ${r.vigente_hasta}` : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
