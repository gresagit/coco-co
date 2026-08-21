import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth";
import { registrarReemplazos } from "@/lib/codigos-barra";

// Marca puntualmente qué folios se van a reimprimir (uno, varios sueltos, o
// un rango — lo que haya llegado ya resuelto a piezaIds desde el cliente) y
// deja constancia en reimpresiones_etiqueta. No genera folios nuevos.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getSessionUser();
  const body = await req.json().catch(() => ({}));
  const piezaIds: string[] = Array.isArray(body.piezaIds) ? body.piezaIds : [];
  const motivo: string | undefined = body.motivo?.trim() || undefined;

  if (!piezaIds.length) {
    return NextResponse.json({ ok: false, mensaje: "No se seleccionó ninguna etiqueta." }, { status: 400 });
  }

  const db = supabaseAdmin();
  // Verifica que las piezas seleccionadas realmente pertenezcan a esta
  // generación, para no dejar reimprimir folios de otra tanda por error.
  const { data: piezasValidas } = await db
    .from("piezas")
    .select("id")
    .eq("generacion_id", params.id)
    .in("id", piezaIds);

  const idsValidos = (piezasValidas || []).map((p: any) => p.id);
  if (!idsValidos.length) {
    return NextResponse.json({ ok: false, mensaje: "Las etiquetas seleccionadas no pertenecen a esta tanda." }, { status: 400 });
  }

  await registrarReemplazos({ piezaIds: idsValidos, motivo, reimpresoPor: user?.id });

  return NextResponse.json({ ok: true, piezaIds: idsValidos });
}
