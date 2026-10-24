import { supabaseAdmin } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { registrarAuditoria } from "@/lib/auditoria";
import { getSessionUser } from "@/lib/auth";
import { ACCIONES_PERMISO, APARTADOS_SISTEMA, esAdministrador, type Permisos } from "@/lib/roles";
import { ConfirmDeleteUsuario } from "@/components/ConfirmDeleteUsuario";

function permisosDesdeFormulario(formData: FormData): Permisos {
  const permisos: Permisos = {};
  const apartadosValidos = new Set<string>(APARTADOS_SISTEMA.map((apartado) => apartado.clave));
  const accionesValidas = new Set<string>(ACCIONES_PERMISO.map((accion) => accion.clave));

  for (const permiso of formData.getAll("permiso")) {
    if (typeof permiso !== "string") throw new Error("Permiso inválido.");
    if (permiso === "*:*") {
      permisos["*"] = ["*"];
      continue;
    }
    const [apartado, accion, ...resto] = permiso.split(":");
    if (resto.length || !apartadosValidos.has(apartado) || !accionesValidas.has(accion)) {
      throw new Error("Permiso inválido.");
    }
    permisos[apartado] = [...new Set([...(permisos[apartado] || []), accion])];
  }

  return permisos;
}

async function exigirAdministrador() {
  const user = await getSessionUser();
  if (!user) throw new Error("NO_AUTH");
  if (!esAdministrador(user.roles)) throw new Error("SOLO_ADMIN_PUEDE_GESTIONAR_USUARIOS");
}

function PermisosEditor({ permisos = {} }: { permisos?: Permisos }) {
  return (
    <>
      <label className="mb-2 flex items-center gap-2 text-xs font-medium text-brand-600">
        <input type="checkbox" name="permiso" value="*:*" defaultChecked={permisos["*"]?.includes("*")} />
        Acceso completo a todos los apartados y acciones
      </label>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {APARTADOS_SISTEMA.map((apartado) => (
          <fieldset key={apartado.clave} className="rounded border border-brand-150 p-2">
            <legend className="px-1 text-xs font-medium text-ink">{apartado.etiqueta}</legend>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {ACCIONES_PERMISO.map((accion) => (
                <label key={accion.clave} className="flex items-center gap-1 text-xs text-brand-600">
                  <input
                    type="checkbox"
                    name="permiso"
                    value={`${apartado.clave}:${accion.clave}`}
                    defaultChecked={permisos[apartado.clave]?.includes(accion.clave)}
                  />
                  {accion.etiqueta}
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </div>
    </>
  );
}

async function crearUsuario(formData: FormData) {
  "use server";
  await exigirAdministrador();
  const db = supabaseAdmin();
  const password = formData.get("password") as string;
  const hash = await bcrypt.hash(password, 10);
  const permisos = permisosDesdeFormulario(formData);

  const { data: usuario, error } = await db
    .from("usuarios")
    .insert({
      usuario: formData.get("usuario"),
      nombre_completo: formData.get("nombre_completo"),
      password_hash: hash,
      acceso_todas_sucursales: formData.get("acceso_todas") === "on",
      permisos,
    })
    .select()
    .single();
  if (error) throw error;

  const rolId = formData.get("rol_id") as string;
  if (rolId) {
    const { error: errorRol } = await db.from("usuario_roles").insert({ usuario_id: usuario.id, rol_id: rolId });
    if (errorRol) throw errorRol;
  }

  const sucursalIds = formData.getAll("sucursal_id") as string[];
  if (sucursalIds.length && formData.get("acceso_todas") !== "on") {
    const { error: errorSucursales } = await db
      .from("usuario_sucursales")
      .insert(sucursalIds.map((sid) => ({ usuario_id: usuario.id, sucursal_id: sid })));
    if (errorSucursales) throw errorSucursales;
  }

  await registrarAuditoria({
    accion: "crear_usuario",
    entidad: "usuarios",
    entidadId: usuario.id,
    detalle: { usuario: usuario.usuario, nombre_completo: usuario.nombre_completo },
  });
  revalidatePath("/dashboard/usuarios");
}

async function cambiarPassword(usuarioId: string, formData: FormData) {
  "use server";
  await exigirAdministrador();
  const db = supabaseAdmin();
  const nueva = formData.get("password_nueva") as string;
  if (!nueva || nueva.length < 4) return;
  const hash = await bcrypt.hash(nueva, 10);
  const { error } = await db.from("usuarios").update({ password_hash: hash }).eq("id", usuarioId);
  if (error) throw error;
  await registrarAuditoria({
    accion: "cambiar_password",
    entidad: "usuarios",
    entidadId: usuarioId,
  });
  revalidatePath("/dashboard/usuarios");
}

async function toggleActivo(usuarioId: string, activo: boolean) {
  "use server";
  await exigirAdministrador();
  const db = supabaseAdmin();
  const { error } = await db.from("usuarios").update({ activo: !activo }).eq("id", usuarioId);
  if (error) throw error;
  await registrarAuditoria({
    accion: activo ? "desactivar_usuario" : "activar_usuario",
    entidad: "usuarios",
    entidadId: usuarioId,
  });
  revalidatePath("/dashboard/usuarios");
}

async function eliminarUsuario(usuarioId: string) {
  "use server";
  await exigirAdministrador();
  const db = supabaseAdmin();

  const { error: errorRoles } = await db.from("usuario_roles").delete().eq("usuario_id", usuarioId);
  if (errorRoles) throw errorRoles;
  const { error: errorSucursales } = await db.from("usuario_sucursales").delete().eq("usuario_id", usuarioId);
  if (errorSucursales) throw errorSucursales;
  const { error } = await db.from("usuarios").delete().eq("id", usuarioId);
  if (error) throw error;

  await registrarAuditoria({
    accion: "eliminar_usuario",
    entidad: "usuarios",
    entidadId: usuarioId,
  });

  revalidatePath("/dashboard/usuarios");
}

async function crearRolPersonalizado(formData: FormData) {
  "use server";
  await exigirAdministrador();
  const db = supabaseAdmin();
  const { data: rol, error } = await db.from("roles").insert({
    nombre: formData.get("nombre"),
    es_base: false,
    temporal: formData.get("temporal") === "on",
    vigente_desde: formData.get("vigente_desde") || null,
    vigente_hasta: formData.get("vigente_hasta") || null,
    permisos: permisosDesdeFormulario(formData),
  }).select().single();
  if (error) throw error;
  await registrarAuditoria({
    accion: "crear_rol",
    entidad: "roles",
    entidadId: rol?.id,
    detalle: { nombre: formData.get("nombre") },
  });
  revalidatePath("/dashboard/usuarios");
}

async function aprobarSolicitudAcceso(solicitudId: string, formData: FormData) {
  "use server";
  const administrador = await getSessionUser();
  if (!administrador) throw new Error("NO_AUTH");
  if (!esAdministrador(administrador.roles)) throw new Error("SOLO_ADMIN_PUEDE_GESTIONAR_USUARIOS");

  const rolId = String(formData.get("rol_id") || "");
  const sucursalIds = Array.from(new Set(formData.getAll("sucursal_id").map(String)));
  if (!rolId || !sucursalIds.length) {
    throw new Error("Selecciona un perfil y al menos una sucursal para aprobar la solicitud.");
  }

  const db = supabaseAdmin();
  const { data: usuarioId, error } = await db.rpc("aprobar_solicitud_acceso", {
    p_solicitud_id: solicitudId,
    p_rol_id: rolId,
    p_sucursal_ids: sucursalIds,
    p_revisado_por: administrador.id,
  });
  if (error) throw error;

  await registrarAuditoria({
    accion: "aprobar_solicitud_acceso",
    entidad: "solicitudes_acceso",
    entidadId: solicitudId,
    detalle: { usuario_id: usuarioId, rol_id: rolId, sucursales: sucursalIds },
  });
  revalidatePath("/dashboard/usuarios");
}

async function rechazarSolicitudAcceso(solicitudId: string) {
  "use server";
  const administrador = await getSessionUser();
  if (!administrador) throw new Error("NO_AUTH");
  if (!esAdministrador(administrador.roles)) throw new Error("SOLO_ADMIN_PUEDE_GESTIONAR_USUARIOS");

  const db = supabaseAdmin();
  const { data, error } = await db
    .from("solicitudes_acceso")
    .update({
      estado: "Rechazada",
      password_hash: null,
      revisado_por: administrador.id,
      revisado_en: new Date().toISOString(),
    })
    .eq("id", solicitudId)
    .eq("estado", "Pendiente")
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("La solicitud ya fue revisada o no existe.");

  await registrarAuditoria({
    accion: "rechazar_solicitud_acceso",
    entidad: "solicitudes_acceso",
    entidadId: solicitudId,
  });
  revalidatePath("/dashboard/usuarios");
}

async function actualizarPermisosRol(rolId: string, formData: FormData) {
  "use server";
  await exigirAdministrador();
  const db = supabaseAdmin();
  const { error } = await db
    .from("roles")
    .update({ permisos: permisosDesdeFormulario(formData) })
    .eq("id", rolId);
  if (error) throw error;
  await registrarAuditoria({
    accion: "actualizar_permisos_rol",
    entidad: "roles",
    entidadId: rolId,
  });
  revalidatePath("/dashboard/usuarios");
}

async function actualizarAccesosUsuario(usuarioId: string, formData: FormData) {
  "use server";
  await exigirAdministrador();
  const db = supabaseAdmin();
  const rolesSeleccionados = Array.from(new Set(formData.getAll("rol_id") as string[]));
  const permisos = permisosDesdeFormulario(formData);

  if (rolesSeleccionados.length) {
    const { data: rolesValidos, error: errorValidacion } = await db
      .from("roles")
      .select("id")
      .in("id", rolesSeleccionados);
    if (errorValidacion) throw errorValidacion;
    if ((rolesValidos || []).length !== rolesSeleccionados.length) {
      throw new Error("Uno de los roles seleccionados ya no existe.");
    }
  }

  const { data: rolesActuales, error: errorLectura } = await db
    .from("usuario_roles")
    .select("rol_id")
    .eq("usuario_id", usuarioId);
  if (errorLectura) throw errorLectura;

  const actuales = new Set((rolesActuales || []).map((relacion) => relacion.rol_id));
  const seleccionados = new Set(rolesSeleccionados);
  const rolesPorAgregar = rolesSeleccionados.filter((rolId) => !actuales.has(rolId));
  if (rolesPorAgregar.length) {
    const { error } = await db
      .from("usuario_roles")
      .insert(rolesPorAgregar.map((rol_id) => ({ usuario_id: usuarioId, rol_id })));
    if (error) throw error;
  }

  const rolesPorQuitar = Array.from(actuales).filter((rolId) => !seleccionados.has(rolId));
  if (rolesPorQuitar.length) {
    const { error } = await db
      .from("usuario_roles")
      .delete()
      .eq("usuario_id", usuarioId)
      .in("rol_id", rolesPorQuitar);
    if (error) throw error;
  }

  const { error: errorUsuario } = await db.from("usuarios").update({ permisos }).eq("id", usuarioId);
  if (errorUsuario) throw errorUsuario;
  await registrarAuditoria({
    accion: "actualizar_accesos_usuario",
    entidad: "usuarios",
    entidadId: usuarioId,
    detalle: { roles: rolesSeleccionados, permisos },
  });
  revalidatePath("/dashboard/usuarios");
}

export default async function UsuariosPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!esAdministrador(user.roles)) redirect("/dashboard");

  const db = supabaseAdmin();
  const [{ data: usuarios }, { data: roles }, { data: sucursales }, { data: usuarioRoles }, solicitudesResult] = await Promise.all([
    db.from("usuarios").select("*").order("created_at"),
    db.from("roles").select("*").order("nombre"),
    db.from("sucursales").select("*").eq("activa", true).order("nombre"),
    db.from("usuario_roles").select("usuario_id, rol_id, roles(nombre)"),
    db.from("solicitudes_acceso")
      .select("id, nombre_completo, usuario, created_at")
      .eq("estado", "Pendiente")
      .order("created_at"),
  ]);
  if (solicitudesResult.error) throw solicitudesResult.error;
  const solicitudes = solicitudesResult.data;

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
        <h2 className="font-semibold mb-2">Solicitudes de acceso pendientes</h2>
        <p className="text-sm text-brand-500 mb-4">
          Al aprobar, asigna un perfil existente y al menos una sucursal. La cuenta podrá iniciar sesión únicamente
          después de la aprobación.
        </p>
        {(solicitudes || []).length === 0 ? (
          <p className="text-sm text-brand-400">No hay solicitudes pendientes.</p>
        ) : (
          <div className="space-y-4">
            {(solicitudes || []).map((solicitud) => (
              <div key={solicitud.id} className="rounded-lg border border-brand-150 p-4">
                <div className="mb-3">
                  <p className="font-medium">{solicitud.nombre_completo}</p>
                  <p className="text-sm text-brand-500">
                    Usuario: <span className="font-mono">{solicitud.usuario}</span>
                    {" · "}Solicitó: {new Date(solicitud.created_at).toLocaleString("es-MX")}
                  </p>
                </div>
                <div className="flex flex-wrap items-end gap-4">
                  <form action={aprobarSolicitudAcceso.bind(null, solicitud.id)} className="flex flex-1 flex-wrap items-end gap-3">
                    <div>
                      <label className="label">Perfil</label>
                      <select name="rol_id" className="input min-w-48" required defaultValue="">
                        <option value="" disabled>Selecciona un perfil</option>
                        {(roles || []).map((rol: any) => (
                          <option key={rol.id} value={rol.id}>{rol.nombre}</option>
                        ))}
                      </select>
                    </div>
                    <fieldset className="min-w-48">
                      <legend className="label">Sucursales permitidas</legend>
                      <div className="flex flex-wrap gap-3">
                        {(sucursales || []).map((sucursal: any) => (
                          <label key={sucursal.id} className="flex items-center gap-1 text-sm">
                            <input type="checkbox" name="sucursal_id" value={sucursal.id} />
                            {sucursal.nombre}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                    <button className="btn-primary text-sm">Aprobar y crear cuenta</button>
                  </form>
                  <form action={rechazarSolicitudAcceso.bind(null, solicitud.id)}>
                    <button className="btn-secondary text-sm">Rechazar</button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        )}
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
          <fieldset className="md:col-span-3 border border-brand-150 rounded-lg p-3">
            <legend className="px-1 text-sm font-medium text-ink">Permisos directos del usuario</legend>
            <PermisosEditor />
          </fieldset>
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
          <div className="md:col-span-4">
            <fieldset className="border border-brand-150 rounded-lg p-3">
              <legend className="px-1 text-sm font-medium text-ink">Permisos del rol</legend>
              <PermisosEditor />
            </fieldset>
          </div>
          <div className="md:col-span-4"><button className="btn-primary">Crear rol</button></div>
        </form>
        <p className="text-xs text-brand-500 mt-2">
          Los permisos directos del usuario y los de todos sus roles se combinan. Cada apartado permite definir
          quién puede verlo, crearlo, editarlo o eliminarlo.
        </p>
      </div>

      <div className="card overflow-x-auto">
        <h2 className="font-semibold mb-3">Usuarios</h2>
        <table className="table-base">
          <thead><tr><th>Usuario</th><th>Nombre</th><th>Roles</th><th>Estado</th><th>Accesos</th><th>Cambiar contraseña</th><th></th></tr></thead>
          <tbody>
            {(usuarios || []).map((u: any) => (
              <tr key={u.id}>
                <td className="font-mono text-xs">{u.usuario}</td>
                <td>{u.nombre_completo}</td>
                <td>{(rolesPorUsuario[u.id] || []).join(", ") || "—"}</td>
                <td><span className={u.activo ? "badge-verde" : "badge-rojo"}>{u.activo ? "Activo" : "Inactivo"}</span></td>
                <td>
                  <details>
                    <summary className="cursor-pointer text-brand-600 underline text-xs">Editar accesos</summary>
                    <form action={actualizarAccesosUsuario.bind(null, u.id)} className="mt-3 min-w-[min(80vw,48rem)] space-y-3">
                      <fieldset className="border border-brand-150 rounded-lg p-3">
                        <legend className="px-1 text-xs font-medium text-ink">Roles asignados</legend>
                        <div className="flex flex-wrap gap-3">
                          {(roles || []).map((rol: any) => (
                            <label key={rol.id} className="flex items-center gap-1 text-xs text-brand-600">
                              <input
                                type="checkbox"
                                name="rol_id"
                                value={rol.id}
                                defaultChecked={(usuarioRoles || []).some(
                                  (relacion: any) => relacion.usuario_id === u.id && relacion.rol_id === rol.id
                                )}
                              />
                              {rol.nombre}
                            </label>
                          ))}
                        </div>
                      </fieldset>
                      <fieldset className="border border-brand-150 rounded-lg p-3">
                        <legend className="px-1 text-xs font-medium text-ink">Permisos directos</legend>
                        <PermisosEditor permisos={u.permisos || {}} />
                      </fieldset>
                      <button className="btn-secondary text-xs">Guardar accesos</button>
                    </form>
                  </details>
                </td>
                <td>
                  <form action={cambiarPassword.bind(null, u.id)} className="flex gap-2">
                    <input name="password_nueva" type="password" placeholder="Nueva contraseña" className="input !w-40 !py-1" />
                    <button className="btn-secondary text-xs">Cambiar</button>
                  </form>
                </td>
                <td>
                  <div className="flex gap-2 items-center">
                    <form action={toggleActivo.bind(null, u.id, u.activo)}>
                      <button className="btn-secondary text-xs">{u.activo ? "Desactivar" : "Activar"}</button>
                    </form>
                    <ConfirmDeleteUsuario
                      usuario={u.usuario}
                      action={eliminarUsuario.bind(null, u.id)}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card overflow-x-auto">
        <h2 className="font-semibold mb-3">Roles</h2>
        <table className="table-base">
          <thead><tr><th>Nombre</th><th>Base / Personalizado</th><th>Temporal</th><th>Vigencia</th><th>Permisos</th></tr></thead>
          <tbody>
            {(roles || []).map((r: any) => (
              <tr key={r.id}>
                <td className="font-medium">{r.nombre}</td>
                <td>{r.es_base ? "Base" : "Personalizado"}</td>
                <td>{r.temporal ? "Sí" : "No"}</td>
                <td>{r.vigente_desde || "—"} {r.vigente_hasta ? `→ ${r.vigente_hasta}` : ""}</td>
                <td>
                  <details>
                    <summary className="cursor-pointer text-brand-600 underline text-xs">Editar permisos</summary>
                    <form action={actualizarPermisosRol.bind(null, r.id)} className="mt-3 min-w-[min(80vw,48rem)] space-y-3">
                      <PermisosEditor permisos={r.permisos || {}} />
                      <button className="btn-secondary text-xs">Guardar permisos</button>
                    </form>
                  </details>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
