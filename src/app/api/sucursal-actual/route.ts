import { NextRequest, NextResponse } from "next/server";
import { setSucursalActualId } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const { sucursalId } = await req.json();
  if (!sucursalId || typeof sucursalId !== "string") {
    return NextResponse.json({ ok: false, message: "sucursalId requerido" }, { status: 400 });
  }
  setSucursalActualId(sucursalId);
  return NextResponse.json({ ok: true });
}
