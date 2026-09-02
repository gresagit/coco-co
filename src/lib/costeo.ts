import { supabaseAdmin } from "@/lib/supabase/server";
import { convertirCantidad } from "@/lib/unidades";

// Calcula el costo unitario de un producto sumando su BOM.
// Soporta receta anidada: si un item del BOM es otro producto
// (insumo_producto_id), calcula recursivamente el costo de ese producto.
export async function calcularCostoProducto(
  productoId: string,
  visitados: Set<string> = new Set()
): Promise<number> {
  if (visitados.has(productoId)) return 0; // evita ciclos infinitos
  visitados.add(productoId);

  const db = supabaseAdmin();
  const { data: items } = await db
    .from("bom")
    .select("cantidad_por_unidad, unidad, insumo_id, insumo_producto_id, insumos(costo_unitario_actual, unidad_medida)")
    .eq("producto_id", productoId);

  let total = 0;
  for (const item of items || []) {
    if (item.insumo_id) {
      const costoInsumo = Number((item as any).insumos?.costo_unitario_actual || 0);
      const unidadBaseInsumo = (item as any).insumos?.unidad_medida || item.unidad;
      const cantidadEnUnidadBase = convertirCantidad(Number(item.cantidad_por_unidad), item.unidad, unidadBaseInsumo);
      total += cantidadEnUnidadBase * costoInsumo;
    } else if (item.insumo_producto_id) {
      const costoAnidado = await calcularCostoProducto(item.insumo_producto_id, visitados);
      total += Number(item.cantidad_por_unidad) * costoAnidado;
    }
  }
  return total;
}

export function precioSugerido(costo: number, margen: number) {
  if (margen >= 1 || margen < 0) return costo; // margen inválido, evita división por 0/negativos
  return costo / (1 - margen);
}
