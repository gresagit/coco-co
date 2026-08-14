import { NextRequest, NextResponse } from "next/server";
import { login } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const { usuario, password } = await req.json();
    if (!usuario || !password) {
      return NextResponse.json({ message: "Usuario y contraseña son requeridos." }, { status: 400 });
    }
    const result = await login(usuario, password);
    if (!result.ok) {
      return NextResponse.json({ message: result.message }, { status: 401 });
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { message: e.message || "Error al iniciar sesión. Revisa la configuración de Supabase." },
      { status: 500 }
    );
  }
}
