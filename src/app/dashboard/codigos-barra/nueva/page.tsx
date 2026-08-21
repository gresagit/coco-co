import { supabaseAdmin } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth";
import { generarPedidoMultiProducto } from "@/lib/codigos-barra";
import { redirect } from "next/navigation";
import Link from "next/link";

async function generar(formData: FormData) {
  "use server";
  const user = await getSessionUser();
  const sucursalId = formData.get("sucursal_id") as string;

  const items: { productoId: string; cantidad: number }[] = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("cantidad_")) continue;
    const cantidad = Number(value);
    if (cantidad > 0) {
      items.push({ productoId: key.replace("cantidad_", ""), cantidad });
    }
  }

  if (!items.length) {
    redirect("/dashboard/codigos-barra/nueva?error=vacio");
  }

  let pedidoId: string;
  try {
    const resultado = await generarPedidoMultiProducto({ sucursalId, items, generadoPor: user?.id });
    pedidoId = resultado.pedidoId;
  } catch (err: any) {
    const mensaje = encodeURIComponent(err?.message || "No se pudo generar los códigos.");
    redirect(`/dashboard/codigos-barra/nueva?error=falla&detalle=${mensaje}`);
  }

  redirect(`/dashboard/codigos-barra/pedidos/${pedidoId}`);
}

export default async function NuevaGeneracionPage({
  searchParams,
}: {
  searchParams: { error?: string; detalle?: string };
}) {
  const db = supabaseAdmin();
  const { data: productos } = await db
    .from("productos")
    .select("id, sku, nombre")
    .eq("activo", true)
    .order("nombre");
  const { data: sucursales } = await db.from("sucursales").select("*").eq("activa", true).order("nombre");

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow mb-1">Catálogo · 04</p>
        <h1 className="page-title">Generar códigos de barra</h1>
        <p className="page-subtitle">
          Marca cuántos códigos quieres de cada producto — puedes pedir de uno solo o de varios a la vez — y
          descarga todo junto, en PDF para hoja carta o en formato para impresora térmica.
        </p>
      </div>

      {searchParams.error === "vacio" && (
        <div className="card !py-3 border-2 border-red-600 bg-red-50">
          <p className="text-sm text-red-800">Ponle una cantidad mayor a 0 a por lo menos un producto.</p>
        </div>
      )}

      {searchParams.error === "falla" && (
        <div className="card !py-3 border-2 border-red-600 bg-red-50">
          <p className="text-sm text-red-800 font-medium">No se pudieron generar los códigos.</p>
          <p className="text-sm text-red-700 mt-1">
            {searchParams.detalle ? decodeURIComponent(searchParams.detalle) : "Intenta de nuevo."}
          </p>
        </div>
      )}

      <form action={generar} className="space-y-4">
        <div className="card !py-4 max-w-xs">
          <label className="label">Sucursal</label>
          <select name="sucursal_id" className="input" required>
            {(sucursales || []).map((s: any) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </select>
        </div>

        <div className="card overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Producto</th>
                <th className="w-32">Cantidad</th>
              </tr>
            </thead>
            <tbody>
              {(productos || []).map((p: any) => (
                <tr key={p.id}>
                  <td className="font-mono text-xs">{p.sku}</td>
                  <td>{p.nombre}</td>
                  <td>
                    <input
                      name={`cantidad_${p.id}`}
                      type="number"
                      min="0"
                      step="1"
                      defaultValue={0}
                      className="input !py-1 !w-24"
                    />
                  </td>
                </tr>
              ))}
              {(productos || []).length === 0 && (
                <tr>
                  <td colSpan={3} className="text-brand-400 text-sm py-4">
                    No hay productos activos en el catálogo.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <button className="btn-primary">Generar códigos</button>
      </form>

      <p className="text-xs text-brand-500">
        Cada código es un folio correlativo único por producto (ej. JAB-0001, JAB-0002...), formato Code128. Generar
        códigos aquí no mueve tu inventario — solo crea los folios/etiquetas. Si alguna etiqueta ya impresa se daña,
        no hace falta generar de más "por si acaso": entra a esa tanda y usa "Generar reemplazo" para reimprimir
        exactamente las que necesitas, con el mismo folio.
      </p>

      <p className="text-xs text-brand-400">
        ¿Necesitas ligar los códigos de un producto a un lote de producción específico?{" "}
        <Link href="/dashboard/codigos-barra/nueva/lote" className="underline text-brand-600">
          Genéralo aparte, uno a la vez, aquí.
        </Link>
      </p>
    </div>
  );
}
