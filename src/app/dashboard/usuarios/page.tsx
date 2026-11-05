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
  const usuarioNombre = formData.get("usuario");
  const nombreCompletoValor = formData.get("nombre_completo");
  const passwordValor = formData.get("password");
  if (
    typeof usuarioNombre !== "string" ||
    typeof nombreCompletoValor !== "string" ||
    typeof passwordValor !== "string"
  ) {
    redirect("/dashboard/usuarios?creacion=datos_invalidos");
  }

  const nombreUsuario = usuarioNombre.trim().toLowerCase();
  const nombreCompleto = nombreCompletoValor.trim();
  const password = passwordValor;
  if (
    nombreUsuario.length < 3 ||
    nombreUsuario.length > 32 ||
    !/^[a-z0-9._-]+$/.test(nombreUsuario) ||
    !nombreCompleto ||
    nombreCompleto.length > 120
  ) {
    redirect("/dashboard/usuarios?creacion=datos_invalidos");
  }
  const passwordBytes = new TextEncoder().encode(password).length;
  if (password.length < 8 || passwordBytes > 72) {
    redirect("/dashboard/usuarios?creacion=password_invalida");
  }

  const accesoTodas = formData.get("acceso_todas") === "on";
  const rolIdValor = formData.get("rol_id");
  const rolId = typeof rolIdValor === "string" ? rolIdValor : "";
  const sucursalIds = Array.from(new Set(formData.getAll("sucursal_id").filter(
    (sucursalId): sucursalId is string => typeof sucursalId === "string"
  )));

  if (rolId) {
    const { data: rol, error } = await db.from("roles").select("id").eq("id", rolId).maybeSingle();
    if (error) {
      console.error("[usuarios] no se pudo validar el rol:", error);
      redirect("/dashboard/usuarios?creacion=error");
    }
    if (!rol) redirect("/dashboard/usuarios?creacion=rol_invalido");
  }

  if (!accesoTodas && sucursalIds.length) {
    const { data: sucursalesValidas, error } = await db
      .from("sucursales")
      .select("id")
      .eq("activa", true)
      .in("id", sucursalIds);
    if (error) {
      console.error("[usuarios] no se pudieron validar las sucursales:", error);
      redirect("/dashboard/usuarios?creacion=error");
    }
    if ((sucursalesValidas || []).length !== sucursalIds.length) {
      redirect("/dashboard/usuarios?creacion=sucursales_invalidas");
    }
  }

  const { data: usuarioExistente, error: errorExistente } = await db
    .from("usuarios")
    .select("id")
    .eq("usuario", nombreUsuario)
    .maybeSingle();
  if (errorExistente) {
    console.error("[usuarios] no se pudo validar el nombre de usuario:", errorExistente);
    redirect("/dashboard/usuarios?creacion=error");
  }
  if (usuarioExistente) redirect("/dashboard/usuarios?creacion=duplicado");

  const hash = await bcrypt.hash(password, 10);
  const permisos = permisosDesdeFormulario(formData);

  const { data: usuario, error } = await db
    .from("usuarios")
    .insert({
      usuario: nombreUsuario,
      nombre_completo: nombreCompleto,
      password_hash: hash,
      acceso_todas_sucursales: accesoTodas,
      permisos,
    })
    .select("id, usuario, nombre_completo")
    .single();
  if (error) {
    console.error("[usuarios] no se pudo crear la cuenta:", error);
    redirect(error.code === "23505"
      ? "/dashboard/usuarios?creacion=duplicado"
      : "/dashboard/usuarios?creacion=error");
  }

  if (rolId) {
    const { error: errorRol } = await db.from("usuario_roles").insert({ usuario_id: usuario.id, rol_id: rolId });
    if (errorRol) {
      console.error("[usuarios] no se pudo asignar el rol; se desactivará la cuenta creada:", errorRol);
      const { error: errorDesactivacion } = await db
        .from("usuarios")
        .update({ activo: false })
        .eq("id", usuario.id);
      if (errorDesactivacion) {
        console.error("[usuarios] tampoco se pudo desactivar la cuenta incompleta:", errorDesactivacion);
        redirect("/dashboard/usuarios?creacion=desactivacion_fallida");
      }
      redirect("/dashboard/usuarios?creacion=asignacion_fallida");
    }
  }

  if (sucursalIds.length && !accesoTodas) {
    const { error: errorSucursales } = await db
      .from("usuario_sucursales")
      .insert(sucursalIds.map((sid) => ({ usuario_id: usuario.id, sucursal_id: sid })));
    if (errorSucursales) {
      console.error("[usuarios] no se pudieron asignar las sucursales; se desactivará la cuenta creada:", errorSucursales);
      const { error: errorDesactivacion } = await db
        .from("usuarios")
        .update({ activo: false })
        .eq("id", usuario.id);
      if (errorDesactivacion) {
        console.error("[usuarios] tampoco se pudo desactivar la cuenta incompleta:", errorDesactivacion);
        redirect("/dashboard/usuarios?creacion=desactivacion_fallida");
      }
      redirect("/dashboard/usuarios?creacion=asignacion_fallida");
    }
  }

  await registrarAuditoria({
    accion: "crear_usuario",
    entidad: "usuarios",
    entidadId: usuario.id,
    detalle: { usuario: usuario.usuario, nombre_completo: usuario.nombre_completo },
  });
  revalidatePath("/dashboard/usuarios");
  redirect("/dashboard/usuarios?creacion=ok");
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

async function desactivarUsuario(usuarioId: string) {
  "use server";
  await exigirAdministrador();
  const db = supabaseAdmin();

  const { error } = await db.from("usuarios").update({ activo: false }).eq("id", usuarioId);
  if (error) throw error;

  await registrarAuditoria({
    accion: "desactivar_usuario",
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

export default async function UsuariosPage({
  searchParams,
}: {
  searchParams?: { estado?: string; creacion?: string };
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!esAdministrador(user.roles)) redirect("/dashboard");

  const mostrarInactivos = searchParams?.estado === "inactivos";
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
  const usuariosMostrados = (usuarios || []).filter((usuario: any) =>
    mostrarInactivos ? !usuario.activo : usuario.activo
  );
  const cantidadInactivos = (usuarios || []).filter((usuario: any) => !usuario.activo).length;

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

      {searchParams?.creacion && (
        <div
          className={`card !py-3 border ${
            searchParams.creacion === "ok"
              ? "border-green-600 bg-green-50"
              : "border-red-600 bg-red-50"
          }`}
          role="status"
        >
          {searchParams.creacion === "ok" && <p className="text-sm text-green-800">Usuario creado correctamente.</p>}
          {searchParams.creacion === "datos_invalidos" && (
            <p className="text-sm text-red-800">
              Revisa los datos: el usuario debe tener de 3 a 32 caracteres (letras minúsculas, números, punto, guion o guion bajo) y el nombre completo hasta 120 caracteres.
            </p>
          )}
          {searchParams.creacion === "password_invalida" && (
            <p className="text-sm text-red-800">La contraseña debe tener al menos 8 caracteres y no más de 72 bytes.</p>
          )}
          {searchParams.creacion === "duplicado" && (
            <p className="text-sm text-red-800">
              Ya existe una cuenta con ese nombre, posiblemente inactiva. Revisa{" "}
              <a href="/dashboard/usuarios?estado=inactivos" className="underline">usuarios inactivos</a>{" "}
              o elige otro nombre.
            </p>
          )}
          {searchParams.creacion === "rol_invalido" && (
            <p className="text-sm text-red-800">El rol seleccionado ya no existe. Actualiza la página y vuelve a intentarlo.</p>
          )}
          {searchParams.creacion === "sucursales_invalidas" && (
            <p className="text-sm text-red-800">Una o más sucursales seleccionadas ya no están activas. Actualiza la página y vuelve a intentarlo.</p>
          )}
          {searchParams.creacion === "asignacion_fallida" && (
            <p className="text-sm text-red-800">
              La cuenta se creó pero falló la asignación de accesos y quedó desactivada. Revisa usuarios inactivos antes de volver a crearla.
            </p>
          )}
          {searchParams.creacion === "desactivacion_fallida" && (
            <p className="text-sm text-red-800">
              Falló la asignación de accesos y no se pudo confirmar la desactivación de la cuenta. Revisa los registros del servidor de inmediato.
            </p>
          )}
          {searchParams.creacion === "error" && (
            <p className="text-sm text-red-800">
              No se pudo crear el usuario. Intenta de nuevo; si continúa, comparte los registros del servidor con soporte.
            </p>
          )}
        </div>
      )}

      <details className="card group">
        <summary className="cursor-pointer select-none font-semibold">
          Solicitudes de acceso pendientes ({(solicitudes || []).length})
        </summary>
        <div className="mt-4">
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
      </details>

      <details className="card group" open={Boolean(searchParams?.creacion && searchParams.creacion !== "ok")}>
        <summary className="cursor-pointer select-none font-semibold">Crear usuario</summary>
        <div className="mt-4">
        <form action={crearUsuario} className="grid md:grid-cols-3 gap-3">
          <div>
            <label className="label">Usuario (login)</label>
            <input name="usuario" className="input" minLength={3} maxLength={32} pattern="[a-zA-Z0-9._-]+" autoCapitalize="none" required />
          </div>
          <div>
            <label className="label">Nombre completo</label>
            <input name="nombre_completo" className="input" maxLength={120} required />
          </div>
          <div>
            <label className="label">Contraseña</label>
            <input name="password" type="password" className="input" minLength={8} required />
          </div>
          <div>
            <label className="label">Rol</label>
            {/* Sin opción vacía, el navegador elegía el primer rol de la lista
                (normalmente "Administrador") al crear un usuario sin tocar el campo. */}
            <select name="rol_id" className="input" defaultValue="">
              <option value="">Sin rol (solo permisos directos)</option>
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
      </details>

      <details className="card group">
        <summary className="cursor-pointer select-none font-semibold">Crear rol / perfil personalizado o temporal</summary>
        <div className="mt-4">
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
      </details>

      <div className="card overflow-x-auto">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">{mostrarInactivos ? "Usuarios inactivos" : "Usuarios activos"}</h2>
          {mostrarInactivos ? (
            <a href="/dashboard/usuarios" className="text-sm text-brand-600 underline">
              Volver a activos
            </a>
          ) : cantidadInactivos > 0 ? (
            <a href="/dashboard/usuarios?estado=inactivos" className="text-sm text-brand-600 underline">
              Ver inactivos ({cantidadInactivos})
            </a>
          ) : null}
        </div>
        <table className="table-base">
          <thead><tr><th>Usuario</th><th>Nombre</th><th>Roles</th><th>Estado</th><th>Accesos</th><th>Contraseña</th><th></th></tr></thead>
          <tbody>
            {usuariosMostrados.map((u: any) => (
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
                  <details>
                    <summary className="cursor-pointer text-brand-600 underline text-xs">Cambiar</summary>
                    <form action={cambiarPassword.bind(null, u.id)} className="mt-2 flex gap-2">
                      <input name="password_nueva" type="password" placeholder="Nueva contraseña" className="input !w-40 !py-1" />
                      <button className="btn-secondary text-xs">Guardar</button>
                    </form>
                  </details>
                </td>
                <td>
                  <div className="flex gap-2 items-center">
                    {u.activo ? (
                      <ConfirmDeleteUsuario
                        usuario={u.usuario}
                        action={desactivarUsuario.bind(null, u.id)}
                        label="Desactivar"
                      />
                    ) : (
                      <form action={toggleActivo.bind(null, u.id, u.activo)}>
                        <button className="btn-secondary text-xs">Activar</button>
                      </form>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {usuariosMostrados.length === 0 && (
              <tr>
                <td colSpan={7} className="py-6 text-center text-sm text-brand-400">
                  {mostrarInactivos ? "No hay usuarios inactivos." : "No hay usuarios activos."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <details className="card group overflow-x-auto">
        <summary className="cursor-pointer select-none font-semibold">Roles ({(roles || []).length})</summary>
        <table className="table-base mt-4">
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
      </details>
    </div>
  );
}
