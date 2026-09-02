// Utilidad compartida para convertir cantidades entre unidades de la misma
// familia (masa o volumen). Se usa en cualquier lugar donde una línea de la
// fórmula (BOM) pueda estar capturada en una unidad distinta a la unidad
// base en la que se registra el costo y el stock del insumo
// (`insumos.unidad_medida`), por ejemplo gramos en la receta cuando el
// insumo se compra y almacena en kilos.
const FACTORES_CONVERSION: Record<string, Record<string, number>> = {
  kg: { kg: 1, g: 0.001 },
  g: { g: 1, kg: 1000 },
  L: { L: 1, ml: 0.001 },
  ml: { ml: 1, L: 1000 },
  pz: { pz: 1 },
  m: { m: 1 },
};

// Convierte `cantidad` de `deUnidad` a `aUnidad`. Si no hay una conversión
// conocida entre ambas (ej. unidades de familias distintas, o datos viejos
// sin unidad), regresa la cantidad sin convertir para no romper el cálculo,
// aunque esto no debería pasar si la UI solo ofrece unidades de la misma
// familia que el insumo.
export function convertirCantidad(cantidad: number, deUnidad: string, aUnidad: string): number {
  if (!deUnidad || !aUnidad || deUnidad === aUnidad) return cantidad;
  const factor = FACTORES_CONVERSION[aUnidad]?.[deUnidad];
  return factor !== undefined ? cantidad * factor : cantidad;
}
