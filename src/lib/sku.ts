import { supabaseAdmin } from "@/lib/supabase/server";

function normalizarPrefijo(texto: string, largo = 3): string {
  const limpio = texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // quita acentos
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase();
  return (limpio.slice(0, largo) || "GEN").padEnd(Math.min(largo, limpio.length || largo), "X");
}

/**
 * Genera el siguiente SKU para un producto terminado de forma automática,
 * a partir del nombre de su categoría (o "PROD" si no tiene). Formato: PREFIJO-0001
 */
export async function siguienteSkuProducto(categoriaNombre?: string | null): Promise<string> {
  const db = supabaseAdmin();
  const prefijo = categoriaNombre ? normalizarPrefijo(categoriaNombre, 3) : "PROD";

  const { count } = await db
    .from("productos")
    .select("*", { count: "exact", head: true })
    .ilike("sku", `${prefijo}-%`);

  const siguiente = (count || 0) + 1;
  const sku = `${prefijo}-${String(siguiente).padStart(4, "0")}`;

  // Salvaguarda por si el conteo no refleja folios ya usados (borrados, etc.)
  const { data: existe } = await db.from("productos").select("id").eq("sku", sku).maybeSingle();
  if (existe) {
    return `${prefijo}-${String(siguiente + Math.floor(Math.random() * 90) + 10).padStart(4, "0")}`;
  }
  return sku;
}

const PREFIJOS_INSUMO: Record<string, string> = {
  "Materia Prima": "MP",
  "Empaque": "EMP",
  "Etiqueta": "ETQ",
  "Producto Intermedio": "INT",
};

/**
 * Genera el siguiente código interno para un insumo, a partir de su tipo.
 * Formato: MP-0001, EMP-0001, ETQ-0001, INT-0001
 */
export async function siguienteCodigoInsumo(tipo: string): Promise<string> {
  const db = supabaseAdmin();
  const prefijo = PREFIJOS_INSUMO[tipo] || "INS";

  const { count } = await db
    .from("insumos")
    .select("*", { count: "exact", head: true })
    .ilike("codigo_interno", `${prefijo}-%`);

  const siguiente = (count || 0) + 1;
  const codigo = `${prefijo}-${String(siguiente).padStart(4, "0")}`;

  const { data: existe } = await db.from("insumos").select("id").eq("codigo_interno", codigo).maybeSingle();
  if (existe) {
    return `${prefijo}-${String(siguiente + Math.floor(Math.random() * 90) + 10).padStart(4, "0")}`;
  }
  return codigo;
}
