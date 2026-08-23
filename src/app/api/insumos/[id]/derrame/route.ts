import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, getSucursalActualId } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/server";
import { registrarAuditoria } from "@/lib/auditoria";

// Registra una salida rápida de insumo (derrame, merma, uso no planeado)
// justo después de escanear su código de barras — sin tener que abrir la
// ficha completa. Resta del stock disponible de la sucursal actual y deja
// rastro en "movimientos" igual que un ajuste manual normal.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ ok: false, mensaje: "Sesión no válida." }, { status: 401 });
  }

  const sucursalId = getSucursalActualId();
  if (!sucursalId) {
    return NextResponse.json(
      { ok: false, mensaje: "Elige una tienda arriba a la derecha antes de registrar el derrame." },
      { status: 400 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const cantidad = Number(body.cantidad);
  const motivo = (body.motivo as string)?.trim() || "Derrame";

  if (!cantidad || cantidad <= 0) {
    return NextResponse.json({ ok: false, mensaje: "La cantidad debe ser mayor a cero." }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { data: insumo } = await db.from("insumos").select("*").eq("id", params.id).maybeSingle();
  if (!insumo) {
    return NextResponse.json({ ok: false, mensaje: "Insumo no encontrado." }, { status: 404 });
  }

  const { data: stockRow } = await db
    .from("insumo_stock")
    .select("*")
    .eq("insumo_id", params.id)
    .eq("sucursal_id", sucursalId)
    .maybeSingle();

  const actual = Number(stockRow?.cantidad_disponible || 0);
  const nueva = actual - cantidad;

  if (stockRow) {
    await db.from("insumo_stock").update({ cantidad_disponible: nueva }).eq("id", stockRow.id);
  } else {
    await db.from("insumo_stock").insert({
      insumo_id: params.id,
      sucursal_id: sucursalId,
      cantidad_disponible: nueva,
      stock_minimo: 0,
    });
  }

  await db.from("movimientos").insert({
    tipo: "Salida",
    origen_tipo: "Insumo",
    insumo_id: params.id,
    sucursal_id: sucursalId,
    cantidad,
    referencia: "Escaneo - derrame/salida rápida",
    motivo,
    usuario_id: user.id,
    notas: `Registrado desde el escáner de insumos (${motivo}).`,
  });

  await registrarAuditoria({
    accion: "registrar_derrame_insumo",
    entidad: "insumos",
    entidadId: params.id,
    sucursalId,
    detalle: { cantidad, motivo },
  });

  return NextResponse.json({
    ok: true,
    mensaje: `Se descontaron ${cantidad} ${insumo.unidad_medida} de ${insumo.nombre}.`,
    nuevaCantidad: nueva,
  });
}
