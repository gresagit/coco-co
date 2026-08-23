import { supabaseAdmin } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import Link from "next/link";
import { siguienteCodigoInsumo } from "@/lib/sku";
import { getSucursalActualId } from "@/lib/auth";
import type { SVGProps } from "react";
import CollapsePanel from "@/components/CollapsePanel";
import EscanerInsumos from "@/components/EscanerInsumos";
import { registrarAuditoria } from "@/lib/auditoria";

async function crearInsumo(formData: FormData) {
  "use server";
  const db = supabaseAdmin();
  const tipo = formData.get("tipo") as string;
  // El código interno se genera automáticamente a partir del tipo de insumo.
  const codigoInterno = await siguienteCodigoInsumo(tipo);
  const controlaCaducidad = formData.get("controla_caducidad") === "on";
  const cantidadInicial = Number(formData.get("cantidad_inicial") || 0);
  const fechaCaducidad = (formData.get("fecha_caducidad") as string) || null;

  const { data: insumo, error } = await db
    .from("insumos")
    .insert({
      codigo_interno: codigoInterno,
      nombre: formData.get("nombre"),
      marca: (formData.get("marca") as string)?.trim() || null,
      tipo,
      unidad_medida: formData.get("unidad_medida"),
      controla_caducidad: controlaCaducidad,
      costo_unitario_actual: Number(formData.get("costo_unitario_actual") || 0),
    })
    .select()
    .single();

  if (!error && insumo) {
    // Crea fila de stock (0) en todas las sucursales activas
    const { data: sucursales } = await db.from("sucursales").select("id").eq("activa", true);
    if (sucursales?.length) {
      await db.from("insumo_stock").insert(
        sucursales.map((s: any) => ({ insumo_id: insumo.id, sucursal_id: s.id, stock_minimo: 0, cantidad_disponible: 0 }))
      );
    }

    // Si se capturó cantidad inicial, se aplica a la sucursal con la que
    // estás trabajando ahorita (la que elegiste arriba a la derecha).
    const sucursalActualId = getSucursalActualId();
    if (cantidadInicial > 0 && sucursalActualId) {
      if (controlaCaducidad) {
        await db.from("insumo_lotes").insert({
          insumo_id: insumo.id,
          sucursal_id: sucursalActualId,
          folio_lote: `${codigoInterno}-INICIAL`,
          fecha_caducidad: fechaCaducidad,
          cantidad_inicial: cantidadInicial,
          cantidad_restante: cantidadInicial,
        });
      }
      await db
        .from("insumo_stock")
        .update({ cantidad_disponible: cantidadInicial })
        .eq("insumo_id", insumo.id)
        .eq("sucursal_id", sucursalActualId);
      await db.from("movimientos").insert({
        tipo: "Entrada",
        origen_tipo: "Insumo",
        insumo_id: insumo.id,
        sucursal_id: sucursalActualId,
        cantidad: cantidadInicial,
        referencia: "Alta inicial",
        notas: "Cantidad inicial capturada al crear el insumo",
      });
    }

    await registrarAuditoria({
      accion: "crear_insumo",
      entidad: "insumos",
      entidadId: insumo.id,
      detalle: { codigo_interno: insumo.codigo_interno, nombre: insumo.nombre, tipo },
    });
  }
  revalidatePath("/dashboard/insumos");
}

export default async function InsumosPage() {
  const db = supabaseAdmin();
  const { data: insumos } = await db.from("insumos").select("*").order("nombre");

  const sucursalId = getSucursalActualId();
  let sucursalNombre = "";
  const stockPorInsumo: Record<string, number> = {};
  if (sucursalId) {
    const { data: sucursal } = await db.from("sucursales").select("nombre").eq("id", sucursalId).maybeSingle();
    sucursalNombre = sucursal?.nombre || "";
    const { data: stockRows } = await db
      .from("insumo_stock")
      .select("insumo_id, cantidad_disponible")
      .eq("sucursal_id", sucursalId);
    for (const row of stockRows || []) {
      stockPorInsumo[row.insumo_id] = Number(row.cantidad_disponible);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="eyebrow mb-1">Catálogo · 02</p>
            <h1 className="page-title">Insumos</h1>
            <p className="page-subtitle">
              Materia prima, empaque, etiquetas y productos intermedios. El código interno se genera automáticamente según el tipo.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/dashboard/insumos/codigos-barra" className="btn-secondary text-sm">
              Imprimir códigos de barra
            </Link>
          </div>
        </div>
      </div>

      <CollapsePanel
        title="Escanear insumos"
        description="Lee un código con lector Bluetooth o cámara para registrar un derrame o abrir la ficha completa."
        icon={<IconScan className="w-[18px] h-[18px]" />}
      >
        <EscanerInsumos embedded />
      </CollapsePanel>

      <div className="card">
        <h2 className="font-semibold mb-3">Nuevo insumo</h2>
        {!sucursalId && (
          <p className="text-xs text-accent-600 mb-3">
            No tienes una tienda elegida arriba a la derecha — puedes crear el insumo, pero la cantidad inicial no se
            va a poder guardar hasta que elijas sucursal.
          </p>
        )}
        <form action={crearInsumo} className="grid md:grid-cols-3 gap-3">
          <div>
            <label className="label">Nombre</label>
            <input name="nombre" className="input" required />
          </div>
          <div>
            <label className="label">Marca (opcional)</label>
            <input name="marca" className="input" placeholder="Ej. proveedor o fabricante" />
          </div>
          <div>
            <label className="label">Tipo</label>
            <select name="tipo" className="input" required>
              <option>Materia Prima</option>
              <option>Empaque</option>
              <option>Etiqueta</option>
              <option>Producto Intermedio</option>
            </select>
            <p className="text-xs text-brand-400 mt-1">Define el prefijo del código (ej. Empaque → EMP-0001).</p>
          </div>
          <div>
            <label className="label">Unidad de medida</label>
            <select name="unidad_medida" className="input" required>
              <option value="kg">kg</option>
              <option value="L">L</option>
              <option value="pz">pz</option>
              <option value="m">m</option>
            </select>
          </div>
          <div>
            <label className="label">Costo unitario actual</label>
            <input name="costo_unitario_actual" type="number" step="0.0001" className="input" defaultValue={0} />
          </div>
          <div>
            <label className="label">
              Cantidad inicial {sucursalNombre && <span className="text-brand-400 font-normal">({sucursalNombre})</span>}
            </label>
            <input name="cantidad_inicial" type="number" step="0.01" min={0} className="input" placeholder="Ej. 100" defaultValue={0} />
          </div>
          <div>
            <label className="label">Fecha de caducidad (si aplica)</label>
            <input name="fecha_caducidad" type="date" className="input" />
          </div>
          <div className="flex items-center gap-2 pt-6">
            <input type="checkbox" name="controla_caducidad" id="cad" />
            <label htmlFor="cad" className="text-sm">¿Controla caducidad? (activa FEFO)</label>
          </div>
          <div className="md:col-span-3">
            <button className="btn-primary">Agregar insumo</button>
          </div>
        </form>
      </div>

      <div className="card overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th>Código</th>
              <th>Nombre</th>
              <th>Marca</th>
              <th>Tipo</th>
              <th>Disponible{sucursalNombre && ` (${sucursalNombre})`}</th>
              <th>Caducidad</th>
              <th>Costo actual</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(insumos || []).map((i: any) => (
              <tr key={i.id}>
                <td className="font-mono text-xs">{i.codigo_interno}</td>
                <td className="font-medium">{i.nombre}</td>
                <td className="text-brand-500">{i.marca || "—"}</td>
                <td>{i.tipo}</td>
                <td className="font-medium">
                  {sucursalId ? `${stockPorInsumo[i.id] ?? 0} ${i.unidad_medida}` : "—"}
                </td>
                <td>{i.controla_caducidad ? <span className="badge-amarillo">FEFO</span> : "—"}</td>
                <td>${Number(i.costo_unitario_actual).toFixed(4)}</td>
                <td className="whitespace-nowrap">
                  <Link href={`/dashboard/insumos/${i.id}/stock`} className="text-brand-600 text-xs underline">
                    Ver / editar
                  </Link>
                  <span className="text-brand-200 mx-1.5">·</span>
                  <a
                    href={`/api/insumos/${i.id}/barcode/pdf`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-brand-600 text-xs underline"
                  >
                    Código de barra
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function IconScan(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} {...props}>
      <path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 12h16" strokeLinecap="round" />
    </svg>
  );
}
