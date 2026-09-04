"use client";

import { useState } from "react";

export default function EntradaInsumoForm({
  insumoId,
  sucursalId,
  unidadMedida,
  controlaCaducidad,
  agregarEntrada,
}: {
  insumoId: string;
  sucursalId: string;
  unidadMedida: string;
  controlaCaducidad: boolean;
  agregarEntrada: (insumoId: string, formData: FormData) => Promise<void>;
}) {
  const [cantidad, setCantidad] = useState("");
  const [subtotal, setSubtotal] = useState("");
  const [ivaPorcentaje, setIvaPorcentaje] = useState("");
  const [ivaIncluido, setIvaIncluido] = useState(false);
  const [envio, setEnvio] = useState("");

  const cant = Number(cantidad);
  const subtotalNumero = Number(subtotal);
  const iva = ivaIncluido ? 0 : subtotalNumero * (Number(ivaPorcentaje) / 100);
  const costo = subtotalNumero + iva + Number(envio || 0);
  const costoUnitario = cant > 0 && costo > 0 ? costo / cant : null;

  return (
    <form action={agregarEntrada.bind(null, insumoId)} className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-brand-400">Agregar cantidad (compra o carga inicial)</p>
      <input type="hidden" name="sucursal_id" value={sucursalId} />
      <div className="flex flex-wrap gap-2 items-end">
        <div>
          <label className="label !mb-1">Cantidad ({unidadMedida})</label>
          <input
            name="cantidad"
            type="number"
            step="0.01"
            min={0.01}
            placeholder="Ej. 100"
            className="input !w-28"
            value={cantidad}
            onChange={(e) => setCantidad(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="label !mb-1">Subtotal</label>
          <input
            name="costo_subtotal"
            type="number"
            step="0.01"
            min={0}
            placeholder="Ej. 200"
            className="input !w-32"
            value={subtotal}
            onChange={(e) => setSubtotal(e.target.value)}
          />
        </div>
        <div>
          <label className="label !mb-1">IVA (%)</label>
          <input name="iva_porcentaje" type="number" step="0.01" min={0} placeholder="16" className="input !w-24" value={ivaPorcentaje} onChange={(e) => setIvaPorcentaje(e.target.value)} />
          <label className="mt-1 flex items-center gap-1 text-[11px] text-brand-500">
            <input name="iva_incluido" type="checkbox" checked={ivaIncluido} onChange={(e) => setIvaIncluido(e.target.checked)} /> incluido
          </label>
        </div>
        <div>
          <label className="label !mb-1">Envío</label>
          <input name="envio_total" type="number" step="0.01" min={0} placeholder="0" className="input !w-24" value={envio} onChange={(e) => setEnvio(e.target.value)} />
        </div>
        {controlaCaducidad && (
          <>
            <div>
              <label className="label !mb-1">Caducidad</label>
              <input name="fecha_caducidad" type="date" className="input !w-40" />
            </div>
            <div>
              <label className="label !mb-1">Folio de lote (opcional)</label>
              <input name="folio_lote" placeholder="Opcional" className="input !w-44" />
            </div>
          </>
        )}
        <button className="btn-primary text-xs">Agregar</button>
      </div>
      <p className="text-xs text-brand-500">
        {costoUnitario !== null ? (
          <>
            Costo calculado:{" "}
            <span className="font-medium text-ink">
              ${costoUnitario.toFixed(4)} por {unidadMedida}
            </span>{" "}
            (${costo.toFixed(2)} ÷ {cant} {unidadMedida}, incluye IVA y envío)
          </>
        ) : (
          <>Captura la cantidad que compraste y cuánto pagaste en total; el costo por {unidadMedida} se calcula solo.</>
        )}
      </p>
    </form>
  );
}
