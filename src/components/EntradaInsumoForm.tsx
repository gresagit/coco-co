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
  const [costoTotal, setCostoTotal] = useState("");

  const cant = Number(cantidad);
  const costo = Number(costoTotal);
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
          <label className="label !mb-1">Costo total pagado</label>
          <input
            name="costo_total"
            type="number"
            step="0.01"
            min={0}
            placeholder="Ej. 200"
            className="input !w-32"
            value={costoTotal}
            onChange={(e) => setCostoTotal(e.target.value)}
          />
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
            (${costo.toFixed(2)} ÷ {cant} {unidadMedida})
          </>
        ) : (
          <>Captura la cantidad que compraste y cuánto pagaste en total; el costo por {unidadMedida} se calcula solo.</>
        )}
      </p>
    </form>
  );
}
