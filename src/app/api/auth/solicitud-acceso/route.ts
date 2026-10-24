import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { supabaseAdmin } from "@/lib/supabase/server";

const NOMBRE_MAXIMO = 120;
const USUARIO_MINIMO = 3;
const USUARIO_MAXIMO = 32;
const PASSWORD_MINIMO = 8;
const PASSWORD_MAXIMO_BYTES = 72;

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "El formulario no contiene datos válidos." }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ message: "Completa todos los campos." }, { status: 400 });
  }

  const { nombreCompleto, usuario, password } = body as Record<string, unknown>;
  if (typeof nombreCompleto !== "string" || typeof usuario !== "string" || typeof password !== "string") {
    return NextResponse.json({ message: "Completa todos los campos." }, { status: 400 });
  }

  const nombreLimpio = nombreCompleto.trim();
  const usuarioLimpio = usuario.trim().toLowerCase();
  const bytesPassword = new TextEncoder().encode(password).length;
  if (!nombreLimpio || nombreLimpio.length > NOMBRE_MAXIMO) {
    return NextResponse.json({ message: "El nombre completo es obligatorio y debe tener máximo 120 caracteres." }, { status: 400 });
  }
  if (
    usuarioLimpio.length < USUARIO_MINIMO ||
    usuarioLimpio.length > USUARIO_MAXIMO ||
    !/^[a-z0-9._-]+$/.test(usuarioLimpio)
  ) {
    return NextResponse.json(
      { message: "El usuario debe tener de 3 a 32 caracteres: letras, números, punto, guion o guion bajo." },
      { status: 400 }
    );
  }
  if (password.length < PASSWORD_MINIMO || bytesPassword > PASSWORD_MAXIMO_BYTES) {
    return NextResponse.json(
      { message: "La contraseña debe tener al menos 8 caracteres y no más de 72 bytes." },
      { status: 400 }
    );
  }

  const db = supabaseAdmin();
  const [{ data: existente, error: errorUsuario }, { data: pendiente, error: errorSolicitud }] = await Promise.all([
    db.from("usuarios").select("id").eq("usuario", usuarioLimpio).maybeSingle(),
    db.from("solicitudes_acceso").select("id").eq("usuario", usuarioLimpio).eq("estado", "Pendiente").maybeSingle(),
  ]);
  if (errorUsuario) throw errorUsuario;
  if (errorSolicitud) throw errorSolicitud;
  if (existente || pendiente) {
    return NextResponse.json(
      { message: "Ese usuario ya existe o tiene una solicitud pendiente. Contacta al administrador." },
      { status: 409 }
    );
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const { error } = await db.from("solicitudes_acceso").insert({
    nombre_completo: nombreLimpio,
    usuario: usuarioLimpio,
    password_hash: passwordHash,
  });
  if (error?.code === "23505") {
    return NextResponse.json(
      { message: "Ese usuario ya tiene una solicitud pendiente. Contacta al administrador." },
      { status: 409 }
    );
  }
  if (error) throw error;

  return NextResponse.json({
    ok: true,
    message: "Solicitud enviada. El administrador revisará tus datos y te asignará un perfil.",
  });
}
