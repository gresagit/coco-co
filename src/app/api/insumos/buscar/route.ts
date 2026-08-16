import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, getSucursalActualId } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/server";

// Busca un insumo por su código interno (el mismo texto que lleva impreso
// su código de barras). Se usa desde el escáner de insumos: al leer el
// código, esto resuelve a qué insumo corresponde para poder ir directo a su
// ficha o registrar un derrame/salida rápida.
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ ok: false, mensaje: "Sesión no válida." }, { status: 401 });
  }

  const codigo = req.nextUrl.searchParams.get("codigo")?.trim();
  if (!codigo) {
    return NextResponse.json({ ok: false, mensaje: "Falta el código a buscar." }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { data: insumo } = await db
    .from("insumos")
    .select("*")
    .ilike("codigo_interno", codigo)
    .maybeSingle();

  if (!insumo) {
    return NextResponse.json({ ok: false, mensaje: `No existe ningún insumo con el código "${codigo}".` });
  }

  const sucursalId = getSucursalActualId();
  let stock: { cantidad_disponible: number; stock_minimo: number } | null = null;
  if (sucursalId) {
    const { data: stockRow } = await db
      .from("insumo_stock")
      .select("cantidad_disponible, stock_minimo")
      .eq("insumo_id", insumo.id)
      .eq("sucursal_id", sucursalId)
      .maybeSingle();
    if (stockRow) {
      stock = {
        cantidad_disponible: Number(stockRow.cantidad_disponible),
        stock_minimo: Number(stockRow.stock_minimo),
      };
    }
  }

  return NextResponse.json({
    ok: true,
    insumo: {
      id: insumo.id,
      codigo_interno: insumo.codigo_interno,
      nombre: insumo.nombre,
      marca: insumo.marca,
      tipo: insumo.tipo,
      unidad_medida: insumo.unidad_medida,
    },
    stock,
  });
}
