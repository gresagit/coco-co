import { NextRequest, NextResponse } from "next/server";
import { setSucursalActualId } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const { sucursalId } = await req.json();
  if (!sucursalId || typeof sucursalId !== "string") {
    return NextResponse.json({ ok: false, message: "sucursalId requerido" }, { status: 400 });
  }

  try {
    await setSucursalActualId(sucursalId);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e.message === "NO_AUTH") {
      return NextResponse.json({ ok: false, message: "Sesión no válida" }, { status: 401 });
    }
    if (e.message === "SUCURSAL_NO_PERMITIDA") {
      return NextResponse.json({ ok: false, message: "No tienes acceso a esa sucursal" }, { status: 403 });
    }
    return NextResponse.json({ ok: false, message: "No se pudo actualizar la sucursal activa" }, { status: 500 });
  }
}