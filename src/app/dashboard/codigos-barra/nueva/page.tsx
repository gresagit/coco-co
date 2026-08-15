import { supabaseAdmin } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth";
import { generarTandaCodigosBarra, ModoGeneracion } from "@/lib/codigos-barra";
import { redirect } from "next/navigation";

async function generar(formData: FormData) {
  "use server";
  const user = await getSessionUser();

  const generacionId = await generarTandaCodigosBarra({
    productoId: formData.get("producto_id") as string,
    sucursalId: formData.get("sucursal_id") as string,
    cantidad: Number(formData.get("cantidad")),
    porcentajeRepuesto: Number(formData.get("porcentaje_repuesto") || 5),
    modo: formData.get("modo") as ModoGeneracion,
    loteId: (formData.get("lote_id") as string) || undefined,
    folioLoteNuevo: (formData.get("folio_lote_nuevo") as string) || undefined,
    generadoPor: user?.id,
  });

  redirect(`/dashboard/codigos-barra/${generacionId}`);
}

export default async function NuevaGeneracionPage({ searchParams }: { searchParams: { producto?: string } }) {
  const db = supabaseAdmin();
  const { data: productos } = await db.from("productos").select("id, sku, nombre").eq("activo", true).order("nombre");
  const { data: sucursales } = await db.from("sucursales").select("*").eq("activa", true).order("nombre");

  const productoSel = searchParams.producto || productos?.[0]?.id;
  const { data: lotesDelProducto } = productoSel
    ? await db
        .from("lotes")
        .select("id, folio_lote, fecha_produccion")
        .eq("producto_id", productoSel)
        .order("created_at", { ascending: false })
    : { data: [] };

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow mb-1">Catálogo · 04</p>
        <h1 className="page-title">Generar códigos de barra</h1>
        <p className="page-subtitle">
          Elige el producto, si van ligados a un lote, cuántos códigos quieres y descarga el PDF listo para imprimir.
        </p>
      </div>

      <form action={generar} className="card space-y-5">
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="label">Producto</label>
            <select name="producto_id" defaultValue={productoSel} className="input" required>
              {(productos || []).map((p: any) => (
                <option key={p.id} value={p.id}>{p.sku} — {p.nombre}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Sucursal</label>
            <select name="sucursal_id" className="input" required>
              {(sucursales || []).map((s: any) => (
                <option key={s.id} value={s.id}>{s.nombre}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="label mb-2">¿Estos códigos pertenecen a un lote?</label>
          <div className="space-y-3">
            <label className="flex items-start gap-2 text-sm">
              <input type="radio" name="modo" value="sin_lote" defaultChecked className="mt-1" />
              <span>
                <b>Sin lote (impresión anticipada)</b> — genera folios sueltos, útil para imprimir etiquetas
                antes de que exista producción física. Los podrás asociar a un lote más adelante si hace falta.
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input type="radio" name="modo" value="lote_existente" className="mt-1" />
              <span className="flex-1">
                <b>Asociar a un lote ya existente</b> de este producto:
                <select name="lote_id" className="input mt-1 !w-full">
                  <option value="">— Selecciona un lote —</option>
                  {(lotesDelProducto || []).map((l: any) => (
                    <option key={l.id} value={l.id}>{l.folio_lote} · {l.fecha_produccion}</option>
                  ))}
                </select>
                {(lotesDelProducto || []).length === 0 && (
                  <p className="text-xs text-brand-400 mt-1">Este producto todavía no tiene lotes registrados.</p>
                )}
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input type="radio" name="modo" value="lote_nuevo" className="mt-1" />
              <span className="flex-1">
                <b>Crear un lote nuevo para esta tanda</b> (folio opcional, se genera uno automático si lo dejas vacío):
                <input name="folio_lote_nuevo" className="input mt-1" placeholder="Ej. JAB-2026-LOTE-A" />
              </span>
            </label>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="label">Cantidad de códigos a imprimir</label>
            <input name="cantidad" type="number" min="1" step="1" className="input" required />
          </div>
          <div>
            <label className="label">% de etiquetas de repuesto</label>
            <input name="porcentaje_repuesto" type="number" min="0" step="1" defaultValue={5} className="input" />
          </div>
        </div>

        <button className="btn-primary">Generar y ver PDF</button>
      </form>

      <p className="text-xs text-brand-500">
        Cada código es un folio correlativo único por producto (ej. JAB-0001, JAB-0002...), formato Code128, listo
        para tu imprenta externa. Generar códigos aquí no mueve tu inventario — solo crea los folios/etiquetas.
      </p>
    </div>
  );
}
