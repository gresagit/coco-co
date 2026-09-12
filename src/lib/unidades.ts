// Utilidad compartida para convertir cantidades entre unidades de la misma
// familia (masa o volumen) y usar la medida correcta cuando la receta se
// captura en otra escala de la misma familia (ej. gramos en vez de kilos).
const FACTORES_CONVERSION: Record<string, Record<string, number>> = {
  kg: { g: 1000, kg: 1 },
  g: { kg: 0.001, g: 1 },
  L: { ml: 1000, L: 1 },
  ml: { L: 0.001, ml: 1 },
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
  const factor = FACTORES_CONVERSION[deUnidad]?.[aUnidad];
  return factor !== undefined ? cantidad * factor : cantidad;
}
