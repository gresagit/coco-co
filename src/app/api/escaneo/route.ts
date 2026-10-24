import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, getSucursalActualId } from "@/lib/auth";
import { confirmarPiezaPorFolio, enviarPiezaPorFolio } from "@/lib/escaneo";
import { registrarAuditoria } from "@/lib/auditoria";
import { esAdministrador, tienePermiso } from "@/lib/roles";

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ ok: false, mensaje: "Sesión no válida." }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, mensaje: "La solicitud no contiene JSON válido." }, { status: 400 });
  }
  const folio = body && typeof body === "object" ? (body as Record<string, unknown>).folio : null;
  if (!folio || typeof folio !== "string") {
    return NextResponse.json({ ok: false, mensaje: "Folio requerido." }, { status: 400 });
  }
  const datos = body as Record<string, unknown>;
  const operacion = datos.operacion === "envio" ? "envio" : "entrada";
  const pedidoId = typeof datos.pedidoId === "string" && datos.pedidoId ? datos.pedidoId : null;

  if (
    operacion === "envio" &&
    !esAdministrador(user.roles) &&
    !tienePermiso(user.permisos, "pedidos_online", "editar") &&
    !tienePermiso(user.permisos, "produccion", "crear")
  ) {
    return NextResponse.json(
      { ok: false, mensaje: "Tu perfil no tiene permiso para escanear salidas de producto terminado." },
      { status: 403 }
    );
  }
  if (operacion === "entrada" && !esAdministrador(user.roles) && !tienePermiso(user.permisos, "produccion", "crear")) {
    return NextResponse.json(
      { ok: false, mensaje: "Tu perfil no tiene permiso para confirmar producto terminado por escaneo." },
      { status: 403 }
    );
  }
  if (operacion === "envio" && pedidoId && !/^[0-9a-f-]{36}$/i.test(pedidoId)) {
    return NextResponse.json({ ok: false, mensaje: "El pedido seleccionado no es válido." }, { status: 400 });
  }

  const sucursalId = getSucursalActualId();
  if (!sucursalId) {
    return NextResponse.json(
      { ok: false, mensaje: "Elige una tienda arriba a la derecha antes de escanear." },
      { status: 400 }
    );
  }

  try {
    if (operacion === "envio") {
      const resultado = await enviarPiezaPorFolio(folio, sucursalId, user.id, pedidoId);
      await registrarAuditoria({
        accion: "escanear_salida_producto",
        entidad: "piezas",
        sucursalId,
        detalle: {
          folio: resultado.folio,
          producto_sku: resultado.productoSku,
          pedido_externo_id: resultado.pedidoExternoId,
        },
      });
      return NextResponse.json(resultado);
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
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : "Ocurrió un error al registrar el escaneo.";
    const status = error && typeof error === "object" && "code" in error && error.code === "P0001" ? 400 : 500;
    return NextResponse.json({ ok: false, folio, mensaje }, { status });
  }
}
