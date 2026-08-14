import { supabaseAdmin } from "@/lib/supabase/server";
import Link from "next/link";

const ESTADO_COLOR: Record<string, string> = {
  Borrador: "badge-amarillo",
  Enviada: "badge-amarillo",
  "Confirmada por proveedor": "badge-verde",
  "Recibida total": "badge-verde",
  "Recibida parcial": "badge-amarillo",
  Cancelada: "badge-rojo",
};

export default async function OrdenesCompraPage() {
  const db = supabaseAdmin();
  const { data: ordenes } = await db
    .from("ordenes_compra")
    .select("*, proveedores(nombre), sucursales(nombre)")
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Órdenes de Compra</h1>
          <p className="text-brand-500">Documento formal, exportable en PDF para el proveedor.</p>
        </div>
        <Link href="/dashboard/ordenes-compra/nueva" className="btn-primary">+ Nueva orden</Link>
      </div>

      <div className="card overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th>Folio</th><th>Proveedor</th><th>Sucursal</th><th>Emisión</th><th>Entrega esperada</th><th>Total</th><th>Estado</th><th></th>
            </tr>
          </thead>
          <tbody>
            {(ordenes || []).map((o: any) => (
              <tr key={o.id}>
                <td className="font-mono text-xs">{o.folio}</td>
                <td>{o.proveedores?.nombre}</td>
                <td>{o.sucursales?.nombre}</td>
                <td>{o.fecha_emision}</td>
                <td>{o.fecha_entrega_esperada || "—"}</td>
                <td>${Number(o.total).toFixed(2)}</td>
                <td><span className={ESTADO_COLOR[o.estado] || "badge-amarillo"}>{o.estado}</span></td>
                <td>
                  <Link href={`/dashboard/ordenes-compra/${o.id}`} className="text-brand-600 text-xs underline">Ver / gestionar</Link>
                </td>
              </tr>
            ))}
            {(ordenes || []).length === 0 && (
              <tr><td colSpan={8} className="text-brand-400 text-sm py-4">Aún no hay órdenes de compra.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
