import { supabaseAdmin } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/auth";

async function registrarGasto(formData: FormData) {
  "use server";
  const db = supabaseAdmin();
  const user = await getSessionUser();

  const payload = {
    fecha: formData.get("fecha") || new Date().toISOString().slice(0, 10),
    categoria: (formData.get("categoria") as string)?.trim() || "General",
    concepto: (formData.get("concepto") as string)?.trim() || "Gasto sin concepto",
    monto: Number(formData.get("monto") || 0),
    proveedor: (formData.get("proveedor") as string)?.trim() || null,
    referencia: (formData.get("referencia") as string)?.trim() || null,
    metodo_pago: (formData.get("metodo_pago") as string)?.trim() || null,
    notas: (formData.get("notas") as string)?.trim() || null,
    registrado_por: user?.id || null,
  };

  if (!payload.concepto || payload.monto <= 0) {
    throw new Error("El concepto y el monto son obligatorios.");
  }

  await db.from("gastos_empresa").insert(payload);
  revalidatePath("/dashboard/gastos");
  revalidatePath("/dashboard/reportes");
}

async function eliminarGasto(id: string) {
  "use server";
  const db = supabaseAdmin();
  await db.from("gastos_empresa").delete().eq("id", id);
  revalidatePath("/dashboard/gastos");
  revalidatePath("/dashboard/reportes");
}

export default async function GastosPage() {
  const db = supabaseAdmin();
  const [{ data: gastos }, { data: resumen }] = await Promise.all([
    db.from("gastos_empresa").select("*").order("fecha", { ascending: false }).limit(200),
    db.from("gastos_empresa").select("fecha, monto").order("fecha", { ascending: true }),
  ]);

  const gastosPorMes = Array.from({ length: 6 }, (_, index) => {
    const date = new Date();
    date.setMonth(date.getMonth() - (5 - index));
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const label = date.toLocaleDateString("es-MX", { month: "short", year: "2-digit" });
    const total = (resumen || []).reduce((sum: number, item: any) => {
      const itemKey = new Date(item.fecha).toISOString().slice(0, 7);
      return itemKey === key ? sum + Number(item.monto || 0) : sum;
    }, 0);

    return { label: label.replace(".", ""), value: total };
  });

  const totalGastos = (gastos || []).reduce((sum: number, gasto: any) => sum + Number(gasto.monto || 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow mb-1">Operación · 04</p>
        <h1 className="page-title">Gastos de la empresa</h1>
        <p className="page-subtitle">Registra egresos variables, pagos de operación, servicios, logística o gastos extraordinarios.</p>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="card">
          <p className="text-brand-500 text-sm">Total registrados</p>
          <p className="text-2xl font-bold mt-1">${totalGastos.toLocaleString("es-MX", { maximumFractionDigits: 2 })}</p>
        </div>
        <div className="card">
          <p className="text-brand-500 text-sm">Gastos últimos 6 meses</p>
          <p className="text-2xl font-bold mt-1">${gastosPorMes.reduce((sum, item) => sum + item.value, 0).toLocaleString("es-MX", { maximumFractionDigits: 2 })}</p>
        </div>
        <div className="card">
          <p className="text-brand-500 text-sm">Registros</p>
          <p className="text-2xl font-bold mt-1">{gastos?.length || 0}</p>
        </div>
      </div>

      <div className="card">
        <h2 className="font-semibold mb-3">Registrar gasto</h2>
        <form action={registrarGasto} className="grid md:grid-cols-6 gap-3 items-end">
          <div>
            <label className="label">Fecha</label>
            <input name="fecha" type="date" className="input" defaultValue={new Date().toISOString().slice(0, 10)} />
          </div>
          <div>
            <label className="label">Categoría</label>
            <input name="categoria" className="input" placeholder="Ej. Logística" defaultValue="General" />
          </div>
          <div className="md:col-span-2">
            <label className="label">Concepto</label>
            <input name="concepto" className="input" placeholder="Ej. Envío de materiales, combustibles, servicio externo" required />
          </div>
          <div>
            <label className="label">Monto</label>
            <input name="monto" type="number" step="0.01" min="0.01" className="input" required />
          </div>
          <div>
            <label className="label">Método de pago</label>
            <select name="metodo_pago" className="input">
              <option value="Efectivo">Efectivo</option>
              <option value="Transferencia">Transferencia</option>
              <option value="Tarjeta">Tarjeta</option>
              <option value="Otro">Otro</option>
            </select>
          </div>
          <div>
            <label className="label">Proveedor</label>
            <input name="proveedor" className="input" placeholder="Opcional" />
          </div>
          <div>
            <label className="label">Referencia</label>
            <input name="referencia" className="input" placeholder="Factura / folio / nota" />
          </div>
          <div className="md:col-span-3">
            <label className="label">Notas</label>
            <input name="notas" className="input" placeholder="Detalles extras del gasto" />
          </div>
          <div className="md:col-span-6">
            <button className="btn-primary">Guardar gasto</button>
          </div>
        </form>
      </div>

      <div className="card overflow-x-auto">
        <h2 className="font-semibold mb-3">Últimos gastos</h2>
        <table className="table-base">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Categoría</th>
              <th>Concepto</th>
              <th>Monto</th>
              <th>Proveedor</th>
              <th>Referencia</th>
              <th>Método</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(gastos || []).map((gasto: any) => (
              <tr key={gasto.id}>
                <td>{new Date(gasto.fecha).toLocaleDateString("es-MX")}</td>
                <td>{gasto.categoria}</td>
                <td>{gasto.concepto}</td>
                <td className="font-medium">${Number(gasto.monto).toLocaleString("es-MX", { maximumFractionDigits: 2 })}</td>
                <td>{gasto.proveedor || "—"}</td>
                <td>{gasto.referencia || "—"}</td>
                <td>{gasto.metodo_pago || "—"}</td>
                <td>
                  <form action={eliminarGasto.bind(null, gasto.id)}>
                    <button className="text-red-600 text-xs underline">Eliminar</button>
                  </form>
                </td>
              </tr>
            ))}
            {(gastos || []).length === 0 && (
              <tr>
                <td colSpan={8} className="text-brand-400 text-sm py-4 text-center">Aún no hay gastos registrados.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2 className="font-semibold mb-3">Evolución de gastos — últimos 6 meses</h2>
        <div className="grid grid-cols-6 gap-3 items-end min-h-48">
          {gastosPorMes.map((item) => {
            const max = Math.max(...gastosPorMes.map((entry) => entry.value), 1);
            const height = `${Math.max((item.value / max) * 100, item.value > 0 ? 16 : 0)}%`;
            return (
              <div key={item.label} className="flex flex-col items-center gap-2 h-48 justify-end">
                <div className="w-full flex justify-center items-end h-full">
                  <div className="w-full rounded-t-md bg-brand-500/80" style={{ height }} title={`${item.label}: $${item.value.toFixed(2)}`} />
                </div>
                <span className="text-[10px] text-brand-400 text-center">{item.label}</span>
                <span className="text-[10px] text-ink font-medium">${item.value.toLocaleString("es-MX", { maximumFractionDigits: 0 })}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
