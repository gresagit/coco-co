"use client";

import { useState } from "react";

type Insumo = { id: string; codigo_interno: string; nombre: string; unidad_medida: string };

type Fila = { insumo_id: string; cantidad: string; costo_total: string };

export default function ItemsOrdenCompra({ insumos }: { insumos: Insumo[] }) {
  const [filas, setFilas] = useState<Fila[]>([{ insumo_id: "", cantidad: "", costo_total: "" }]);

  function actualizar(i: number, campo: keyof Fila, valor: string) {
    setFilas((prev) => prev.map((f, idx) => (idx === i ? { ...f, [campo]: valor } : f)));
  }
  function agregarFila() {
    setFilas((prev) => [...prev, { insumo_id: "", cantidad: "", costo_total: "" }]);
  }
  function quitarFila(i: number) {
    setFilas((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev));
  }

  const insumosPorId = new Map(insumos.map((i) => [i.id, i]));

  return (
    <div>
      <h2 className="font-semibold mb-2">Insumos solicitados</h2>
      <p className="text-xs text-brand-500 mb-3">
        Indica qué compraste, cuánto de eso, y cuánto pagaste en total por esa partida: el costo por unidad (kg, L,
        pieza, etc.) se calcula solo. Ej. 100 kg por $200 = $20.00 por kg.
      </p>
      <div className="space-y-3">
        {filas.map((fila, i) => {
          const insumo = insumosPorId.get(fila.insumo_id);
          const cantidad = Number(fila.cantidad);
          const costoTotal = Number(fila.costo_total);
          const costoUnitario = cantidad > 0 && costoTotal > 0 ? costoTotal / cantidad : null;
          return (
            <div
              key={i}
              className="grid grid-cols-1 sm:grid-cols-[1.5fr_auto_auto_auto_auto] gap-2 pb-3 sm:pb-0 border-b sm:border-b-0 border-brand-100 items-end"
            >
              <div>
                <label className="label !mb-1 sm:hidden">Insumo</label>
                <select
                  name="insumo_id"
                  className="input"
                  value={fila.insumo_id}
                  onChange={(e) => actualizar(i, "insumo_id", e.target.value)}
                >
                  <option value="">— Insumo —</option>
                  {insumos.map((ins) => (
                    <option key={ins.id} value={ins.id}>
                      {ins.codigo_interno} — {ins.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label !mb-1 sm:hidden">Cantidad{insumo ? ` (${insumo.unidad_medida})` : ""}</label>
                <input
                  name="cantidad"
                  type="number"
                  step="0.01"
                  className="input sm:!w-28"
                  placeholder="Cantidad"
                  value={fila.cantidad}
                  onChange={(e) => actualizar(i, "cantidad", e.target.value)}
                />
              </div>
              <div>
                <label className="label !mb-1 sm:hidden">Costo total de la partida</label>
                <input
                  type="number"
                  step="0.01"
                  className="input sm:!w-32"
                  placeholder="Ej. 200"
                  value={fila.costo_total}
                  onChange={(e) => actualizar(i, "costo_total", e.target.value)}
                />
              </div>
              {/* El costo unitario real que se guarda es calculado, no se captura a mano */}
              <input type="hidden" name="costo_unitario" value={costoUnitario ?? ""} />
              <div className="text-xs text-brand-500 sm:w-28">
                {costoUnitario !== null ? (
                  <>≈ ${costoUnitario.toFixed(4)} / {insumo?.unidad_medida || "u."}</>
                ) : (
                  "costo / unidad"
                )}
              </div>
              <button type="button" onClick={() => quitarFila(i)} className="text-red-600 text-xs underline">
                Quitar
              </button>
            </div>
          );
        })}
      </div>
      <button type="button" onClick={agregarFila} className="btn-secondary text-xs mt-3">
        + Agregar otro insumo
      </button>
    </div>
  );
}
