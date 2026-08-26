"use client";

import { useState } from "react";

export default function CostoInicialInsumo({ sucursalNombre }: { sucursalNombre?: string }) {
  const [cantidad, setCantidad] = useState("");
  const [costoTotal, setCostoTotal] = useState("");

  const cantidadNumero = Number(cantidad);
  const costoTotalNumero = Number(costoTotal);
  const costoUnitario = cantidadNumero > 0 && costoTotalNumero > 0 ? costoTotalNumero / cantidadNumero : null;

  return (
    <>
      <div>
        <label className="label">
          Cantidad inicial {sucursalNombre && <span className="text-brand-400 font-normal">({sucursalNombre})</span>}
        </label>
        <input
          name="cantidad_inicial"
          type="number"
          step="0.01"
          min={0}
          className="input"
          placeholder="Ej. 100"
          value={cantidad}
          onChange={(event) => setCantidad(event.target.value)}
        />
      </div>
      <div>
        <label className="label">Costo total pagado</label>
        <input
          name="costo_total_inicial"
          type="number"
          step="0.01"
          min={0}
          className="input"
          placeholder="Ej. 200"
          value={costoTotal}
          onChange={(event) => setCostoTotal(event.target.value)}
        />
        <p className="text-xs text-brand-400 mt-1">
          {costoUnitario !== null
            ? `Costo calculado: $${costoUnitario.toFixed(4)} por unidad`
            : "El costo por unidad se calcula automáticamente."}
        </p>
      </div>
    </>
  );
}