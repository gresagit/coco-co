import { supabaseAdmin } from "@/lib/supabase/server";
import Link from "next/link";

export default async function CodigosBarraPage() {
  const db = supabaseAdmin();
  const { data: generaciones } = await db
    .from("generaciones_codigo_barra")
    .select("*, productos(sku, nombre), sucursales(nombre), lotes(folio_lote)")
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="eyebrow mb-1">Catálogo · 04</p>
          <h1 className="page-title">Generador de códigos de barra</h1>
          <p className="page-subtitle">
            Genera e imprime códigos Code128 para cualquier producto, antes o durante la producción.
          </p>
        </div>
        <Link href="/dashboard/codigos-barra/nueva" className="btn-primary">+ Generar códigos</Link>
      </div>

      <div className="card overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Producto</th>
              <th>Sucursal</th>
              <th>Lote</th>
              <th>Cantidad</th>
              <th>Repuesto</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(generaciones || []).map((g: any) => (
              <tr key={g.id}>
                <td className="text-xs">{new Date(g.created_at).toLocaleString("es-MX")}</td>
                <td>{g.productos?.sku} — {g.productos?.nombre}</td>
                <td>{g.sucursales?.nombre}</td>
                <td className="font-mono text-xs">{g.lotes?.folio_lote || <span className="text-brand-400">Sin lote</span>}</td>
                <td>{g.cantidad}</td>
                <td>{g.porcentaje_repuesto}%</td>
                <td>
                  <Link href={`/dashboard/codigos-barra/${g.id}`} className="text-brand-600 text-xs underline">
                    Ver / descargar PDF
                  </Link>
                </td>
              </tr>
            ))}
            {(generaciones || []).length === 0 && (
              <tr><td colSpan={7} className="text-brand-400 text-sm py-4">Aún no has generado códigos de barra.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
