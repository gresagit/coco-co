import { cookies } from "next/headers";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { supabaseAdmin } from "@/lib/supabase/server";

const COOKIE_NAME = "cococo_session";
const SUCURSAL_COOKIE_NAME = "cococo_sucursal_actual";

export type SessionUser = {
  id: string;
  usuario: string;
  nombre_completo: string;
  roles: string[];
  acceso_todas_sucursales: boolean;
  sucursales: string[]; // ids de sucursal permitidas
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
  if (crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
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
    return { ok: false as const, message: "Usuario o contraseña incorrectos." };
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    return { ok: false as const, message: "Usuario o contraseña incorrectos." };
  }

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

export function logout() {
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
    .select("id, usuario, nombre_completo, activo, acceso_todas_sucursales")
    .eq("id", userId)
    .maybeSingle();

  if (!user || !user.activo) return null;

  const { data: roleRows } = await db
    .from("usuario_roles")
    .select("roles(nombre)")
    .eq("usuario_id", user.id);

  const { data: sucRows } = await db
    .from("usuario_sucursales")
    .select("sucursal_id")
    .eq("usuario_id", user.id);

  return {
    id: user.id,
    usuario: user.usuario,
    nombre_completo: user.nombre_completo,
    acceso_todas_sucursales: user.acceso_todas_sucursales,
    roles: (roleRows || []).map((r: any) => r.roles?.nombre).filter(Boolean),
    sucursales: (sucRows || []).map((s: any) => s.sucursal_id),
  };
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    throw new Error("NO_AUTH");
  }
  return user;
}

// Sucursal "activa" en la sesión: el usuario la elige desde un selector en
// el dashboard, y las pantallas que filtran por sucursal la usan como
// default. No sustituye el control de acceso real (usuario_sucursales) —
// solo valida que la sucursal elegida sea una a la que el usuario tenga
// permiso, para evitar que alguien fije por cookie una sucursal ajena.
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