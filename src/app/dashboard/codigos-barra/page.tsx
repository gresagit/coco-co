import { supabaseAdmin } from "@/lib/supabase/server";
import Link from "next/link";

export default async function CodigosBarraPage() {
  const db = supabaseAdmin();
  const { data: generaciones } = await db
    .from("generaciones_codigo_barra")
    .select("*, productos(sku, nombre), sucursales(nombre), lotes(folio_lote)")
    .order("created_at", { ascending: false })
    .limit(100);

  const { data: pedidos } = await db
    .from("pedidos_impresion")
    .select("*, sucursales(nombre)")
    .order("created_at", { ascending: false })
    .limit(20);

  const pedidoIds = (pedidos || []).map((p: any) => p.id);
  const conteoPorPedido: Record<string, { productos: number; etiquetas: number }> = {};
  if (pedidoIds.length) {
    const { data: filas } = await db
      .from("generaciones_codigo_barra")
      .select("pedido_id, cantidad")
      .in("pedido_id", pedidoIds);
    for (const f of filas || []) {
      const acc = conteoPorPedido[f.pedido_id] || { productos: 0, etiquetas: 0 };
      acc.productos += 1;
      acc.etiquetas += f.cantidad;
      conteoPorPedido[f.pedido_id] = acc;
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="eyebrow mb-1">Catálogo · 04</p>
          <h1 className="page-title">Generador de códigos de barra</h1>
          <p className="page-subtitle">
            Genera e imprime códigos Code128 para uno o varios productos a la vez, antes o durante la producción.
          </p>
        </div>
        <Link href="/dashboard/codigos-barra/nueva" className="btn-primary">+ Generar códigos</Link>
      </div>

      {(pedidos || []).length > 0 && (
        <div className="card overflow-x-auto">
          <h2 className="font-semibold mb-3">Pedidos de impresión (varios productos a la vez)</h2>
          <table className="table-base">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Sucursal</th>
                <th>Productos</th>
                <th>Etiquetas</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {(pedidos || []).map((p: any) => (
                <tr key={p.id}>
                  <td className="text-xs">{new Date(p.created_at).toLocaleString("es-MX")}</td>
                  <td>{p.sucursales?.nombre}</td>
                  <td>{conteoPorPedido[p.id]?.productos ?? 0}</td>
                  <td>{conteoPorPedido[p.id]?.etiquetas ?? 0}</td>
                  <td>
                    <Link href={`/dashboard/codigos-barra/pedidos/${p.id}`} className="text-brand-600 text-xs underline">
                      Ver / descargar
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card overflow-x-auto">
        <h2 className="font-semibold mb-3">Tandas por producto</h2>
        <table className="table-base">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Producto</th>
              <th>Sucursal</th>
              <th>Lote</th>
              <th>Cantidad</th>
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
                <td>
                  <Link href={`/dashboard/codigos-barra/${g.id}`} className="text-brand-600 text-xs underline">
                    Ver / descargar
                  </Link>
                </td>
              </tr>
            ))}
            {(generaciones || []).length === 0 && (
              <tr><td colSpan={6} className="text-brand-400 text-sm py-4">Aún no has generado códigos de barra.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
