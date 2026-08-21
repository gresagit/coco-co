import { supabaseAdmin } from "@/lib/supabase/server";
import Link from "next/link";

export default async function PedidoImpresionPage({ params }: { params: { id: string } }) {
  const db = supabaseAdmin();
  const { data: pedido } = await db
    .from("pedidos_impresion")
    .select("*, sucursales(nombre)")
    .eq("id", params.id)
    .single();

  if (!pedido) return <p>Pedido no encontrado.</p>;

  const { data: generaciones } = await db
    .from("generaciones_codigo_barra")
    .select("*, productos(sku, nombre)")
    .eq("pedido_id", params.id)
    .order("created_at");

  const totalEtiquetas = (generaciones || []).reduce((acc: number, g: any) => acc + g.cantidad, 0);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard/codigos-barra" className="text-brand-600 text-sm underline">
          ← Volver
        </Link>
        <h1 className="text-2xl font-bold mt-2">Pedido de impresión</h1>
        <p className="text-brand-500">
          {pedido.sucursales?.nombre} · {(generaciones || []).length} producto(s) · {totalEtiquetas} etiquetas en
          total
        </p>
      </div>

      <div className="card !py-4 flex flex-wrap items-center gap-3">
        <a href={`/api/codigos-barra/pedidos/${pedido.id}/pdf`} target="_blank" className="btn-primary">
          Descargar PDF (hoja carta)
        </a>
        <a href={`/api/codigos-barra/pedidos/${pedido.id}/termica`} target="_blank" className="btn-secondary">
          Descargar para impresora térmica
        </a>
      </div>

      <div className="card overflow-x-auto">
        <h2 className="font-semibold mb-3">Productos en este pedido</h2>
        <table className="table-base">
          <thead>
            <tr>
              <th>SKU</th>
              <th>Producto</th>
              <th>Cantidad</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(generaciones || []).map((g: any) => (
              <tr key={g.id}>
                <td className="font-mono text-xs">{g.productos?.sku}</td>
                <td>{g.productos?.nombre}</td>
                <td>{g.cantidad}</td>
                <td className="whitespace-nowrap">
                  <Link href={`/dashboard/codigos-barra/${g.id}`} className="text-brand-600 text-xs underline">
                    Ver / reemplazar etiquetas dañadas
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-brand-500">
        Si una etiqueta específica de algún producto se daña más adelante, entra a "Ver / reemplazar" de ese
        producto y genera solo el reemplazo puntual — no hace falta volver a generar el pedido completo.
      </p>
    </div>
  );
}
