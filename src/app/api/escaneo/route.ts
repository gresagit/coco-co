import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, getSucursalActualId } from "@/lib/auth";
import { confirmarPiezaPorFolio } from "@/lib/escaneo";
import { registrarAuditoria } from "@/lib/auditoria";

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ ok: false, mensaje: "Sesión no válida." }, { status: 401 });
  }

  const { folio } = await req.json();
  if (!folio || typeof folio !== "string") {
    return NextResponse.json({ ok: false, mensaje: "Folio requerido." }, { status: 400 });
  }

  const sucursalId = getSucursalActualId();
  if (!sucursalId) {
    return NextResponse.json(
      { ok: false, mensaje: "Elige una tienda arriba a la derecha antes de escanear." },
      { status: 400 }
    );
  }

  const resultado = await confirmarPiezaPorFolio(folio, sucursalId, user.id);
  if (resultado.ok) {
    await registrarAuditoria({
      accion: "escanear_pieza",
      entidad: "piezas",
      sucursalId,
      detalle: { folio: resultado.folio, producto_sku: resultado.productoSku },
    });
  }
  return NextResponse.json(resultado);
}
