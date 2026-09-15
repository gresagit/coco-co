import { supabaseAdmin } from "@/lib/supabase/server";

function normalizarPrefijo(texto: string, largo = 3): string {
  const limpio = texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // quita acentos
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase();
  return (limpio.slice(0, largo) || "GEN").padEnd(Math.min(largo, limpio.length || largo), "X");
}

// Nomenclatura fija de líneas de producto terminado (SKU). Antes el prefijo
// se auto-derivaba de las primeras 3 letras del nombre de categoría, lo
// cual generaba colisiones (ej. dos categorías que empiezan con "Jab...").
// Ahora cada línea tiene un código fijo elegido a mano — ver migración 024.
// Para agregar una línea nueva, solo agrega una entrada aquí.
export const LINEAS_PRODUCTO: Array<{ prefijo: string; etiqueta: string }> = [
  { prefijo: "ATB", etiqueta: "ATB — Atomizador Baños" },
  { prefijo: "ATC", etiqueta: "ATC — Atomizador Cocina" },
  { prefijo: "ATM", etiqueta: "ATM — Atomizador Multisuperficies" },
  { prefijo: "LP", etiqueta: "LP — Limpiador de Pisos" },
  { prefijo: "RLP", etiqueta: "RLP — Recarga Limpiador de Pisos" },
  { prefijo: "RAT", etiqueta: "RAT — Recarga Atomizador" },
  { prefijo: "PLM", etiqueta: "PLM — Pastilla Limpiadora Multiusos" },
  { prefijo: "RM", etiqueta: "RM — Removedor de Manchas" },
  { prefijo: "JRN", etiqueta: "JRN — Jabón Ropa Normal" },
  { prefijo: "JPS", etiqueta: "JPS — Jabón Piel Sensible" },
  { prefijo: "JTH", etiqueta: "JTH — Jabón Trastes Hojuela" },
  { prefijo: "PM6", etiqueta: "PM6 — Pasta Limpiadora Multiacción" },
];

/**
 * Genera el siguiente SKU para un producto terminado, a partir de un
 * prefijo de línea fijo (ver LINEAS_PRODUCTO) elegido a mano al crear el
 * producto — ya NO se deriva automáticamente del nombre de categoría.
 * Formato: PREFIJO-0001
 */
export async function siguienteSkuProducto(prefijoLinea: string): Promise<string> {
  const db = supabaseAdmin();
  const prefijo = normalizarPrefijo(prefijoLinea, prefijoLinea.length || 3);

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
