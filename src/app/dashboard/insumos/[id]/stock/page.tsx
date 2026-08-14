import { supabaseAdmin } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import Link from "next/link";

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
  revalidatePath(`/dashboard/insumos/${insumoId}/stock`);
}

async function ajusteManual(insumoId: string, formData: FormData) {
  "use server";
  const db = supabaseAdmin();
  const sucursalId = formData.get("sucursal_id") as string;
  const cantidad = Number(formData.get("cantidad"));
  const tipo = formData.get("tipo") as string; // Entrada | Salida | Ajuste

  const { data: row } = await db
    .from("insumo_stock")
    .select("cantidad_disponible")
    .eq("insumo_id", insumoId)
    .eq("sucursal_id", sucursalId)
    .maybeSingle();

  const actual = Number(row?.cantidad_disponible || 0);
  const nueva = tipo === "Salida" ? actual - cantidad : actual + cantidad;

  await db
    .from("insumo_stock")
    .update({ cantidad_disponible: nueva })
    .eq("insumo_id", insumoId)
    .eq("sucursal_id", sucursalId);

  await db.from("movimientos").insert({
    tipo: tipo === "Ajuste" ? "Ajuste" : tipo,
    origen_tipo: "Insumo",
    insumo_id: insumoId,
    sucursal_id: sucursalId,
    cantidad,
    referencia: "Ajuste manual",
    notas: "Registrado manualmente desde ficha de insumo",
  });

  revalidatePath(`/dashboard/insumos/${insumoId}/stock`);
}

export default async function InsumoStockPage({ params }: { params: { id: string } }) {
  const db = supabaseAdmin();
  const { data: insumo } = await db.from("insumos").select("*").eq("id", params.id).single();
  const { data: stocks } = await db
    .from("insumo_stock")
    .select("*, sucursales(nombre)")
    .eq("insumo_id", params.id);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard/insumos" className="text-brand-600 text-sm underline">
          ← Volver a Insumos
        </Link>
        <h1 className="text-2xl font-bold mt-2">{insumo?.nombre}</h1>
        <p className="text-brand-500">Código {insumo?.codigo_interno} · Stock por sucursal</p>
      </div>

      <div className="card overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th>Sucursal</th>
              <th>Disponible</th>
              <th>Stock mínimo</th>
              <th>Semáforo</th>
              <th>Actualizar mínimo</th>
              <th>Ajuste manual</th>
            </tr>
          </thead>
          <tbody>
            {(stocks || []).map((s: any) => {
              const nivel =
                s.cantidad_disponible <= 0 ? "rojo" : s.cantidad_disponible <= s.stock_minimo ? "amarillo" : "verde";
              return (
                <tr key={s.id}>
                  <td className="font-medium">{s.sucursales?.nombre}</td>
                  <td>{s.cantidad_disponible} {insumo?.unidad_medida}</td>
                  <td>{s.stock_minimo} {insumo?.unidad_medida}</td>
                  <td>
                    <span className={`badge-${nivel}`}>{nivel}</span>
                  </td>
                  <td>
                    <form action={actualizarStockMinimo.bind(null, params.id)} className="flex gap-2">
                      <input type="hidden" name="sucursal_id" value={s.sucursal_id} />
                      <input
                        name="stock_minimo"
                        type="number"
                        step="0.01"
                        defaultValue={s.stock_minimo}
                        className="input !w-24 !py-1"
                      />
                      <button className="btn-secondary text-xs">Guardar</button>
                    </form>
                  </td>
                  <td>
                    <form action={ajusteManual.bind(null, params.id)} className="flex gap-2 items-center">
                      <input type="hidden" name="sucursal_id" value={s.sucursal_id} />
                      <select name="tipo" className="input !w-28 !py-1">
                        <option value="Entrada">Entrada</option>
                        <option value="Salida">Salida</option>
                      </select>
                      <input name="cantidad" type="number" step="0.01" className="input !w-20 !py-1" required />
                      <button className="btn-secondary text-xs">Aplicar</button>
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
