import { supabaseAdmin } from "@/lib/supabase/server";
import SeleccionarCodigosInsumos from "@/components/SeleccionarCodigosInsumos";
import Link from "next/link";

export default async function CodigosBarraInsumosPage() {
  const db = supabaseAdmin();
  const { data: insumos } = await db
    .from("insumos")
    .select("id, codigo_interno, nombre, marca, tipo")
    .eq("activo", true)
    .order("nombre");

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow mb-1">Catálogo · 02</p>
        <h1 className="page-title">Códigos de barra de insumos</h1>
        <p className="page-subtitle">
          Elige cuántos códigos de barra imprimir y descarga el PDF listo para imprimir.
        </p>
        <Link href="/dashboard/insumos/codigos-barra/historial" className="btn-secondary text-sm mt-3 inline-block">
          Ver historial de tandas
        </Link>
      </div>

      <SeleccionarCodigosInsumos insumos={insumos || []} />
    </div>
  );
}
