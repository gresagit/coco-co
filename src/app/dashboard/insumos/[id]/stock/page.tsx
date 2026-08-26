import { supabaseAdmin } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import Link from "next/link";
import { registrarAuditoria } from "@/lib/auditoria";
import EntradaInsumoForm from "@/components/EntradaInsumoForm";

async function agregarEntrada(insumoId: string, formData: FormData) {
  "use server";
  const db = supabaseAdmin();
  const sucursalId = formData.get("sucursal_id") as string;
  const cantidad = Number(formData.get("cantidad"));
  const costoTotal = Number(formData.get("costo_total") || 0);
  const fechaCaducidad = (formData.get("fecha_caducidad") as string) || null;
  const folioLote = (formData.get("folio_lote") as string)?.trim();

  const { data: insumo } = await db.from("insumos").select("*").eq("id", insumoId).single();
  if (!insumo || !cantidad || cantidad <= 0) return;

  // Costo por unidad (kg, L, pieza, etc.) a partir de lo realmente pagado:
  // qué se compró (este insumo), cuánto se compró (cantidad) y cuánto costó
  // en total (costo_total). Ej. 100 kg por $200 => $20.00 por kg.
  const costoUnitario = costoTotal > 0 ? costoTotal / cantidad : null;

  if (insumo.controla_caducidad) {
    const folio = folioLote || `${insumo.codigo_interno}-${new Date().toISOString().slice(0, 10)}`;
    await db.from("insumo_lotes").insert({
      insumo_id: insumoId,
      sucursal_id: sucursalId,
      folio_lote: folio,
      fecha_caducidad: fechaCaducidad,
      cantidad_inicial: cantidad,
      cantidad_restante: cantidad,
      costo_total: costoTotal || null,
      costo_unitario: costoUnitario,
    });
  }

  const { data: row } = await db
    .from("insumo_stock")
    .select("cantidad_disponible")
    .eq("insumo_id", insumoId)
    .eq("sucursal_id", sucursalId)
    .maybeSingle();
  const actual = Number(row?.cantidad_disponible || 0);
  await db
    .from("insumo_stock")
    .update({ cantidad_disponible: actual + cantidad })
    .eq("insumo_id", insumoId)
    .eq("sucursal_id", sucursalId);

  await db.from("movimientos").insert({
    tipo: "Entrada",
    origen_tipo: "Insumo",
    insumo_id: insumoId,
    sucursal_id: sucursalId,
    cantidad,
    costo_total: costoTotal || null,
    costo_unitario: costoUnitario,
    referencia: insumo.controla_caducidad ? "Entrada con lote" : "Entrada",
    notas: "Registrada desde ficha de insumo",
  });

  // El costo por unidad de esta compra se vuelve el costo de referencia del
  // insumo (el que se usa para costear fórmulas/BOM y precio sugerido),
  // porque refleja lo que realmente se acaba de pagar.
  if (costoUnitario !== null) {
    await db.from("insumos").update({ costo_unitario_actual: costoUnitario }).eq("id", insumoId);
  }

  await registrarAuditoria({
    accion: "agregar_entrada_insumo",
    entidad: "insumos",
    entidadId: insumoId,
    sucursalId,
    detalle: { cantidad, costo_total: costoTotal || null, costo_unitario: costoUnitario, folio_lote: folioLote || null },
  });

  revalidatePath(`/dashboard/insumos/${insumoId}/stock`);
  revalidatePath("/dashboard/insumos");
}

async function actualizarDatosInsumo(insumoId: string, formData: FormData) {
  "use server";
  const db = supabaseAdmin();
  await db
    .from("insumos")
    .update({
      nombre: formData.get("nombre"),
      marca: (formData.get("marca") as string)?.trim() || null,
      tipo: formData.get("tipo"),
      unidad_medida: formData.get("unidad_medida"),
      costo_unitario_actual: Number(formData.get("costo_unitario_actual") || 0),
    })
    .eq("id", insumoId);
  await registrarAuditoria({
    accion: "editar_insumo",
    entidad: "insumos",
    entidadId: insumoId,
    detalle: { nombre: formData.get("nombre"), tipo: formData.get("tipo") },
  });
  revalidatePath(`/dashboard/insumos/${insumoId}/stock`);
  revalidatePath("/dashboard/insumos");
}

async function actualizarStockMinimo(insumoId: string, formData: FormData) {
  "use server";
  const db = supabaseAdmin();
  const sucursalId = formData.get("sucursal_id") as string;
  const stockMinimo = Number(formData.get("stock_minimo") || 0);
  await db
    .from("insumo_stock")
    .update({ stock_minimo: stockMinimo })
    .eq("insumo_id", insumoId)
    .eq("sucursal_id", sucursalId);
  await registrarAuditoria({
    accion: "actualizar_stock_minimo_insumo",
    entidad: "insumos",
    entidadId: insumoId,
    sucursalId,
    detalle: { stock_minimo: stockMinimo },
  });
  revalidatePath(`/dashboard/insumos/${insumoId}/stock`);
}

async function ajusteManual(insumoId: string, formData: FormData) {
  "use server";
  const db = supabaseAdmin();
  const sucursalId = formData.get("sucursal_id") as string;
  const cantidad = Number(formData.get("cantidad"));
  const tipo = formData.get("tipo") as string; // Salida | Ajuste

  const { data: row } = await db
    .from("insumo_stock")
    .select("cantidad_disponible")
    .eq("insumo_id", insumoId)
    .eq("sucursal_id", sucursalId)
    .maybeSingle();

  const actual = Number(row?.cantidad_disponible || 0);
  const nueva = actual - cantidad;

  await db
    .from("insumo_stock")
    .update({ cantidad_disponible: nueva })
    .eq("insumo_id", insumoId)
    .eq("sucursal_id", sucursalId);

  await db.from("movimientos").insert({
    tipo,
    origen_tipo: "Insumo",
    insumo_id: insumoId,
    sucursal_id: sucursalId,
    cantidad,
    referencia: "Ajuste manual",
    notas: "Registrado manualmente desde ficha de insumo",
  });

  await registrarAuditoria({
    accion: "ajuste_manual_insumo",
    entidad: "insumos",
    entidadId: insumoId,
    sucursalId,
    detalle: { tipo, cantidad },
  });

  revalidatePath(`/dashboard/insumos/${insumoId}/stock`);
}

export default async function InsumoStockPage({ params }: { params: { id: string } }) {
  const db = supabaseAdmin();
  const { data: insumo } = await db.from("insumos").select("*").eq("id", params.id).single();
  const { data: stocks } = await db
    .from("insumo_stock")
    .select("*, sucursales(nombre)")
    .eq("insumo_id", params.id)
    .order("sucursales(nombre)");

  const lotesPorSucursal: Record<string, any[]> = {};
  if (insumo?.controla_caducidad) {
    const { data: lotes } = await db
      .from("insumo_lotes")
      .select("*")
      .eq("insumo_id", params.id)
      .gt("cantidad_restante", 0)
      .order("fecha_caducidad", { ascending: true });
    for (const lote of lotes || []) {
      (lotesPorSucursal[lote.sucursal_id] ||= []).push(lote);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard/insumos" className="text-brand-600 text-sm underline">
          ← Volver a Insumos
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3 mt-2">
          <div>
            <h1 className="page-title">{insumo?.nombre}</h1>
            <p className="page-subtitle">
              Código {insumo?.codigo_interno} · Stock por sucursal
              {insumo?.controla_caducidad && " · controla caducidad (FEFO)"}
            </p>
          </div>
          <a
            href={`/api/insumos/${params.id}/barcode/pdf`}
            target="_blank"
            rel="noreferrer"
            className="btn-secondary text-sm"
          >
            Descargar código de barra
          </a>
        </div>
      </div>

      {/* Ficha editable: nombre, marca, tipo, unidad, costo — todo lo que
          normalmente se necesita corregir después de escanear el insumo. */}
      <div className="card">
        <h2 className="font-semibold mb-3">Editar datos del insumo</h2>
        <form action={actualizarDatosInsumo.bind(null, params.id)} className="grid md:grid-cols-3 gap-3">
          <div>
            <label className="label">Nombre</label>
            <input name="nombre" defaultValue={insumo?.nombre} className="input" required />
          </div>
          <div>
            <label className="label">Marca (opcional)</label>
            <input name="marca" defaultValue={insumo?.marca || ""} className="input" placeholder="Ej. proveedor o fabricante" />
          </div>
          <div>
            <label className="label">Tipo</label>
            <select name="tipo" defaultValue={insumo?.tipo} className="input" required>
              <option>Materia Prima</option>
              <option>Empaque</option>
              <option>Etiqueta</option>
              <option>Producto Intermedio</option>
            </select>
          </div>
          <div>
            <label className="label">Unidad de medida</label>
            <select name="unidad_medida" defaultValue={insumo?.unidad_medida} className="input" required>
              <option value="kg">kg</option>
              <option value="L">L</option>
              <option value="pz">pz</option>
              <option value="m">m</option>
            </select>
          </div>
          <div>
            <label className="label">Costo unitario actual</label>
            <input
              name="costo_unitario_actual"
              type="number"
              step="0.0001"
              defaultValue={insumo?.costo_unitario_actual}
              className="input"
            />
          </div>
          <div className="flex items-end">
            <button className="btn-primary w-full sm:w-auto">Guardar cambios</button>
          </div>
        </form>
      </div>

      <div className="space-y-4">
        {(stocks || []).map((s: any) => {
          const nivel =
            s.cantidad_disponible <= 0 ? "rojo" : s.cantidad_disponible <= s.stock_minimo ? "amarillo" : "verde";
          const lotes = lotesPorSucursal[s.sucursal_id] || [];
          return (
            <div key={s.id} className="card">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-serif text-lg text-ink">{s.sucursales?.nombre}</h2>
                  <p className="text-sm text-brand-500">
                    Disponible:{" "}
                    <span className="text-ink font-medium">
                      {s.cantidad_disponible} {insumo?.unidad_medida}
                    </span>{" "}
                    · mínimo {s.stock_minimo} {insumo?.unidad_medida} · <span className={`badge-${nivel}`}>{nivel}</span>
                  </p>
                </div>
                <form action={actualizarStockMinimo.bind(null, params.id)} className="flex items-end gap-2">
                  <input type="hidden" name="sucursal_id" value={s.sucursal_id} />
                  <div>
                    <label className="label">Stock mínimo</label>
                    <input name="stock_minimo" type="number" step="0.01" defaultValue={s.stock_minimo} className="input !w-28 !py-1.5" />
                  </div>
                  <button className="btn-secondary text-xs">Guardar</button>
                </form>
              </div>

              <div className="grid md:grid-cols-2 gap-4 mt-4 pt-4 border-t border-brand-100">
                <EntradaInsumoForm
                  insumoId={params.id}
                  sucursalId={s.sucursal_id}
                  unidadMedida={insumo?.unidad_medida || "u."}
                  controlaCaducidad={!!insumo?.controla_caducidad}
                  agregarEntrada={agregarEntrada}
                />

                <form action={ajusteManual.bind(null, params.id)} className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-brand-400">Corregir cantidad (salida o ajuste)</p>
                  <div className="flex flex-wrap gap-2 items-center">
                    <input type="hidden" name="sucursal_id" value={s.sucursal_id} />
                    <select name="tipo" className="input !w-28">
                      <option value="Salida">Salida</option>
                      <option value="Ajuste">Ajuste</option>
                    </select>
                    <input name="cantidad" type="number" step="0.01" min={0.01} placeholder="Cantidad" className="input !w-28" required />
                    <button className="btn-secondary text-xs">Aplicar</button>
                  </div>
                </form>
              </div>

              {insumo?.controla_caducidad && (
                <div className="mt-4 pt-4 border-t border-brand-100">
                  <p className="text-xs font-medium uppercase tracking-wide text-brand-400 mb-2">Lotes activos (FEFO)</p>
                  {lotes.length === 0 ? (
                    <p className="text-sm text-brand-400">Sin lotes registrados todavía.</p>
                  ) : (
                    <table className="table-base">
                      <thead>
                        <tr>
                          <th>Folio</th>
                          <th>Caduca</th>
                          <th>Restante</th>
                          <th>Costo por unidad</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lotes.map((l) => (
                          <tr key={l.id}>
                            <td className="font-mono text-xs">{l.folio_lote}</td>
                            <td>{l.fecha_caducidad || "—"}</td>
                            <td>
                              {l.cantidad_restante} {insumo?.unidad_medida}
                            </td>
                            <td>
                              {l.costo_unitario != null
                                ? `$${Number(l.costo_unitario).toFixed(4)} / ${insumo?.unidad_medida}`
                                : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
