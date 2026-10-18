type FilaStockProducto = {
  producto_id: string;
  sucursal_id: string;
  cantidad_disponible: number | string;
  stock_minimo: number | string;
};

type StockProductoAgrupado<T extends FilaStockProducto> = Omit<
  T,
  "cantidad_disponible" | "stock_minimo"
> & {
  cantidad_disponible: number;
  stock_minimo: number;
};

export function agruparStockProductos<T extends FilaStockProducto>(
  filas: T[]
): StockProductoAgrupado<T>[] {
  const agrupadas = new Map<string, StockProductoAgrupado<T>>();

  for (const fila of filas) {
    const llave = `${fila.producto_id}:${fila.sucursal_id}`;
    const existente = agrupadas.get(llave);
    const cantidad = Number(fila.cantidad_disponible) || 0;
    const minimo = Number(fila.stock_minimo) || 0;

    if (existente) {
      existente.cantidad_disponible += cantidad;
      existente.stock_minimo = Math.max(existente.stock_minimo, minimo);
    } else {
      agrupadas.set(llave, {
        ...fila,
        cantidad_disponible: cantidad,
        stock_minimo: minimo,
      });
    }
  }

  return Array.from(agrupadas.values());
}
