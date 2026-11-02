import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { supabaseAdmin } from "@/lib/supabase/server";
import { esAdministrador, tienePermiso, type Permisos } from "@/lib/roles";

const COOKIE_NAME = "cococo_session";
const SUCURSAL_COOKIE_NAME = "cococo_sucursal_actual";

export type SessionUser = {
  id: string;
  usuario: string;
  nombre_completo: string;
  roles: string[];
  acceso_todas_sucursales: boolean;
  sucursales: string[]; // ids de sucursal permitidas
  permisos: Permisos;
};

function secret() {
  return process.env.SESSION_SECRET || "dev-secret-cambia-esto";
}

function sign(payload: string) {
  const h = crypto.createHmac("sha256", secret()).update(payload).digest("hex");
  return `${payload}.${h}`;
}

function verify(signed: string): string | null {
  const idx = signed.lastIndexOf(".");
  if (idx === -1) return null;
  const payload = signed.slice(0, idx);
  const sig = signed.slice(idx + 1);
  const expected = crypto.createHmac("sha256", secret()).update(payload).digest("hex");
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expected);
  // timingSafeEqual lanza error si los largos difieren (cookie alterada).
  if (sigBuf.length !== expectedBuf.length) return null;
  if (crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return payload;
  }
  return null;
}

export async function login(usuario: string, password: string) {
  const db = supabaseAdmin();
  const { data: user, error } = await db
    .from("usuarios")
    .select("id, usuario, nombre_completo, password_hash, activo, acceso_todas_sucursales")
    .eq("usuario", usuario)
    .maybeSingle();

  if (error || !user || !user.activo) {
    await db.from("auditoria").insert({
      usuario_id: user?.id ?? null,
      accion: "login_fallido",
      entidad: "usuarios",
      detalle: { usuario },
    });
    return { ok: false as const, message: "Usuario o contraseña incorrectos." };
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    await db.from("auditoria").insert({
      usuario_id: user.id,
      accion: "login_fallido",
      entidad: "usuarios",
      entidad_id: user.id,
      detalle: { usuario },
    });
    return { ok: false as const, message: "Usuario o contraseña incorrectos." };
  }

  const { data: sucursalesActivas, error: errorSucursales } = await db
    .from("sucursales")
    .select("id")
    .eq("activa", true)
    .order("nombre");
  if (errorSucursales) throw errorSucursales;

  let sucursalesDisponibles = sucursalesActivas || [];
  if (!user.acceso_todas_sucursales) {
    const { data: asignaciones, error: errorAsignaciones } = await db
      .from("usuario_sucursales")
      .select("sucursal_id")
      .eq("usuario_id", user.id);
    if (errorAsignaciones) throw errorAsignaciones;

    const sucursalesPermitidas = new Set((asignaciones || []).map((fila) => fila.sucursal_id));
    sucursalesDisponibles = sucursalesDisponibles.filter((sucursal) => sucursalesPermitidas.has(sucursal.id));
  }

  const sucursalPreferidaId = cookies().get(SUCURSAL_COOKIE_NAME)?.value;
  const sucursalPredeterminada =
    sucursalesDisponibles.find((sucursal) => sucursal.id === sucursalPreferidaId) || sucursalesDisponibles[0];

  if (sucursalPredeterminada) {
    cookies().set(SUCURSAL_COOKIE_NAME, sucursalPredeterminada.id, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
  } else {
    cookies().delete(SUCURSAL_COOKIE_NAME);
  }

  await db.from("auditoria").insert({
    usuario_id: user.id,
    accion: "login",
    entidad: "usuarios",
    entidad_id: user.id,
    detalle: { usuario },
  });

  const payload = JSON.stringify({ id: user.id, t: Date.now() });
  const token = sign(Buffer.from(payload).toString("base64url"));

  cookies().set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12, // 12 horas
  });

  return { ok: true as const };
}

export async function logout() {
  const user = await getSessionUser();
  if (user) {
    const db = supabaseAdmin();
    await db.from("auditoria").insert({
      usuario_id: user.id,
      sucursal_id: getSucursalActualId(),
      accion: "logout",
      entidad: "usuarios",
      entidad_id: user.id,
      detalle: { usuario: user.usuario },
    });
  }
  cookies().delete(COOKIE_NAME);
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const token = cookies().get(COOKIE_NAME)?.value;
  if (!token) return null;
  const payloadB64 = verify(token);
  if (!payloadB64) return null;

  let userId: string;
  try {
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString());
    userId = payload.id;
  } catch {
    return null;
  }

  const db = supabaseAdmin();
  const { data: user } = await db
    .from("usuarios")
    .select("id, usuario, nombre_completo, activo, acceso_todas_sucursales, permisos")
    .eq("id", userId)
    .maybeSingle();

  if (!user || !user.activo) return null;

  const [{ data: roleRows }, { data: sucRows }] = await Promise.all([
    db
      .from("usuario_roles")
      .select("roles(nombre, permisos, vigente_desde, vigente_hasta)")
      .eq("usuario_id", user.id),
    db
      .from("usuario_sucursales")
      .select("sucursal_id")
      .eq("usuario_id", user.id),
  ]);

  // Un rol con vigencia (perfil temporal) solo cuenta dentro de sus fechas.
  const hoy = new Date().toISOString().slice(0, 10);
  const rolesVigentes = (roleRows || []).filter((row: any) => {
    const rol = row.roles;
    if (!rol) return false;
    if (rol.vigente_desde && hoy < rol.vigente_desde) return false;
    if (rol.vigente_hasta && hoy > rol.vigente_hasta) return false;
    return true;
  });

  const permisos: Permisos = {};
  for (const row of rolesVigentes) {
    const rolePermisos = (row as any).roles?.permisos || {};
    for (const [apartado, acciones] of Object.entries(rolePermisos)) {
      permisos[apartado] = Array.from(new Set([...(permisos[apartado] || []), ...(Array.isArray(acciones) ? acciones : [])]));
    }
  }
  for (const [apartado, acciones] of Object.entries((user as any).permisos || {})) {
    permisos[apartado] = Array.from(new Set([...(permisos[apartado] || []), ...(Array.isArray(acciones) ? acciones : [])]));
  }

  return {
    id: user.id,
    usuario: user.usuario,
    nombre_completo: user.nombre_completo,
    acceso_todas_sucursales: user.acceso_todas_sucursales,
    roles: rolesVigentes.map((r: any) => r.roles?.nombre).filter(Boolean),
    sucursales: (sucRows || []).map((s: any) => s.sucursal_id),
    permisos,
  };
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    throw new Error("NO_AUTH");
  }
  return user;
}

// La sucursal activa se conserva en una cookie por 30 días. Al iniciar sesión
// se elige automáticamente la primera sucursal activa permitida si todavía no
// hay una preferencia válida. Este selector no sustituye el control de acceso:
// al cambiar de sucursal se valida contra las asignaciones del usuario.
export async function setSucursalActualId(sucursalId: string) {
  const user = await getSessionUser();
  if (!user) {
    throw new Error("NO_AUTH");
  }

  const tieneAcceso = user.acceso_todas_sucursales || user.sucursales.includes(sucursalId);
  if (!tieneAcceso) {
    throw new Error("SUCURSAL_NO_PERMITIDA");
  }

  cookies().set(SUCURSAL_COOKIE_NAME, sucursalId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 días
  });
}

export function getSucursalActualId(): string | null {
  return cookies().get(SUCURSAL_COOKIE_NAME)?.value ?? null;
}

function puedeHacer(user: SessionUser, apartado: string, accion: string): boolean {
  return esAdministrador(user.roles) || tienePermiso(user.permisos, apartado, accion);
}

// Para páginas y server actions: exige sesión y permiso sobre el apartado.
// Ocultar el link en el Sidebar NO protege la ruta; esta es la protección real.
export async function requirePermiso(apartado: string, accion = "ver"): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!puedeHacer(user, apartado, accion)) redirect("/dashboard?sin_permiso=1");
  return user;
}

// Para rutas /api: devuelve la respuesta 401/403 si no corresponde, o null si puede seguir.
// Uso: const denegado = await guardApi("ordenes_compra"); if (denegado) return denegado;
export async function guardApi(apartado?: string, accion = "ver"): Promise<NextResponse | null> {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ message: "Sesión no válida" }, { status: 401 });
  if (apartado && !puedeHacer(user, apartado, accion)) {
    return NextResponse.json({ message: "No tienes permiso para esto" }, { status: 403 });
  }
  return null;
}