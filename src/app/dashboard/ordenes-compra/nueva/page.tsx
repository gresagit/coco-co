import { supabaseAdmin } from "@/lib/supabase/server";
import { siguienteFolioOC } from "@/lib/folios";
import { redirect } from "next/navigation";
import { registrarAuditoria } from "@/lib/auditoria";

async function crearOrden(formData: FormData) {
  "use server";
  const db = supabaseAdmin();

  const proveedorId = formData.get("proveedor_id") as string;
  const sucursalId = formData.get("sucursal_id") as string;
  const fechaEntrega = formData.get("fecha_entrega_esperada") as string;
  const condiciones = formData.get("condiciones_pago") as string;

  const insumoIds = formData.getAll("insumo_id") as string[];
  const cantidades = formData.getAll("cantidad") as string[];
  const costos = formData.getAll("costo_unitario") as string[];

  const folio = await siguienteFolioOC();

  const { data: orden, error } = await db
    .from("ordenes_compra")
    .insert({
      folio,
      proveedor_id: proveedorId,
      sucursal_id: sucursalId,
      fecha_entrega_esperada: fechaEntrega || null,
      condiciones_pago: condiciones,
      estado: "Borrador",
    })
    .select()
    .single();

  if (error || !orden) return;

  let total = 0;
  const items = [];
  for (let i = 0; i < insumoIds.length; i++) {
    if (!insumoIds[i]) continue;
    const cantidad = Number(cantidades[i] || 0);
    const costo = Number(costos[i] || 0);
    if (cantidad <= 0) continue;
    total += cantidad * costo;
    items.push({ orden_compra_id: orden.id, insumo_id: insumoIds[i], cantidad, costo_unitario: costo });
  }

  if (items.length) {
    await db.from("orden_compra_items").insert(items);
    await db.from("ordenes_compra").update({ total }).eq("id", orden.id);
  }

  await registrarAuditoria({
    accion: "crear_orden_compra",
    entidad: "ordenes_compra",
    entidadId: orden.id,
    sucursalId: sucursalId,
    detalle: { folio, proveedor_id: proveedorId, total, items: items.length },
  });

  redirect(`/dashboard/ordenes-compra/${orden.id}`);
}

export default async function NuevaOrdenCompraPage({ searchParams }: { searchParams: { insumo?: string } }) {
  const db = supabaseAdmin();
  const [{ data: proveedores }, { data: sucursales }, { data: insumos }] = await Promise.all([
    db.from("proveedores").select("*").eq("activo", true).order("nombre"),
    db.from("sucursales").select("*").eq("activa", true).order("nombre"),
    db.from("insumos").select("id, codigo_interno, nombre, costo_unitario_actual").order("nombre"),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow mb-1">Compras · 02</p>
        <h1 className="page-title">Nueva Orden de Compra</h1>
        <p className="page-subtitle">Se genera en estado "Borrador"; podrás editarla y generar el PDF después.</p>
      </div>

      <form action={crearOrden} className="card space-y-4">
        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
          <div>
            <label className="label">Proveedor</label>
            <select name="proveedor_id" className="input" required>
              {(proveedores || []).map((p: any) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Sucursal que solicita</label>
            <select name="sucursal_id" className="input" required>
              {(sucursales || []).map((s: any) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Fecha de entrega esperada</label>
            <input name="fecha_entrega_esperada" type="date" className="input" />
          </div>
          <div className="sm:col-span-2 md:col-span-3">
            <label className="label">Condiciones de pago</label>
            <input name="condiciones_pago" className="input" placeholder="Ej. 50% anticipo, 50% contra entrega" />
          </div>
        </div>

        <div>
          <h2 className="font-semibold mb-2">Insumos solicitados</h2>
          <p className="text-xs text-brand-500 mb-3">Agrega tantas filas como necesites (se guardan todas las que tengan cantidad {'>'} 0).</p>
          <div className="space-y-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto_auto] gap-2 pb-3 sm:pb-0 border-b sm:border-b-0 border-brand-100">
                <select name="insumo_id" className="input" defaultValue="">
                  <option value="">— Insumo —</option>
                  {(insumos || []).map((ins: any) => (
                    <option key={ins.id} value={ins.id} data-costo={ins.costo_unitario_actual}>
                      {ins.codigo_interno} — {ins.nombre}
                    </option>
                  ))}
                </select>
                <input name="cantidad" type="number" step="0.01" className="input sm:!w-28" placeholder="Cantidad" />
                <input name="costo_unitario" type="number" step="0.0001" className="input sm:!w-32" placeholder="Costo unitario" />
                <div className="text-xs text-brand-400 flex items-center sm:justify-center">fila {i + 1}</div>
              </div>
            ))}
          </div>
        </div>

        <button className="btn-primary">Crear orden de compra</button>
      </form>
    </div>
  );
}
