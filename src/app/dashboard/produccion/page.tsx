import { supabaseAdmin } from "@/lib/supabase/server";
import Link from "next/link";

const APROBACION_COLOR: Record<string, string> = {
  Pendiente: "badge-amarillo",
  Aprobada: "badge-verde",
  Rechazada: "badge-rojo",
};

export default async function ProduccionPage() {
  const db = supabaseAdmin();
  const { data: ordenes } = await db
    .from("ordenes_produccion")
    .select("*, productos(nombre, sku), sucursales(nombre)")
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="eyebrow mb-1">Operación · 01</p>
          <h1 className="page-title">Órdenes de producción</h1>
          <p className="page-subtitle">Declaración de intención de producción + reportes de avance incrementales.</p>
        </div>
        <Link href="/dashboard/produccion/nueva" className="btn-primary">+ Nueva orden</Link>
      </div>

      <div className="card overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr><th>Folio</th><th>Producto</th><th>Sucursal</th><th>Fecha estimada</th><th>Cant. planeada</th><th>Estado</th><th>Visto bueno</th><th></th></tr>
          </thead>
          <tbody>
            {(ordenes || []).map((o: any) => (
              <tr key={o.id}>
                <td className="font-mono text-xs">{o.folio}</td>
                <td>{o.productos?.sku} — {o.productos?.nombre}</td>
                <td>{o.sucursales?.nombre}</td>
                <td>{o.fecha_estimada || "—"}</td>
                <td>{o.cantidad_planeada}</td>
                <td><span className="badge-amarillo">{o.estado}</span></td>
                <td><span className={APROBACION_COLOR[o.aprobacion_estado] || "badge-amarillo"}>{o.aprobacion_estado}</span></td>
                <td><Link href={`/dashboard/produccion/${o.id}`} className="text-brand-600 text-xs underline">Ver / reportar avance</Link></td>
              </tr>
            ))}
            {(ordenes || []).length === 0 && (
              <tr><td colSpan={8} className="text-brand-400 text-sm py-4">Aún no hay órdenes de producción.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
