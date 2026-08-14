import { supabaseAdmin } from "@/lib/supabase/server";

export async function siguienteFolioOC(): Promise<string> {
  const db = supabaseAdmin();
  const { count } = await db.from("ordenes_compra").select("*", { count: "exact", head: true });
  const n = (count || 0) + 1;
  return `OC-${String(n).padStart(5, "0")}`;
}
