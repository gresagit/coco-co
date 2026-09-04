export type DesgloseCostoCompra = {
  subtotal: number;
  ivaPorcentaje: number;
  ivaIncluido: boolean;
  ivaTotal: number;
  envioTotal: number;
  total: number;
};

export function calcularCostoCompra(
  subtotal: number,
  ivaPorcentaje: number,
  ivaIncluido: boolean,
  envioTotal: number
): DesgloseCostoCompra {
  const subtotalSeguro = Math.max(0, subtotal);
  const ivaPorcentajeSeguro = Math.max(0, ivaPorcentaje);
  const envioTotalSeguro = Math.max(0, envioTotal);
  const ivaTotal = ivaIncluido ? 0 : subtotalSeguro * (ivaPorcentajeSeguro / 100);

  return {
    subtotal: subtotalSeguro,
    ivaPorcentaje: ivaPorcentajeSeguro,
    ivaIncluido,
    ivaTotal,
    envioTotal: envioTotalSeguro,
    total: subtotalSeguro + ivaTotal + envioTotalSeguro,
  };
}