"use client";

import { useMemo, useState, useTransition } from "react";

type Insumo = {
  id: string;
  codigo_interno: string;
  nombre: string;
  unidad_medida: string;
  costo_unitario_actual: number;
};

export default function BomAgregarInsumo({
  productoId,
  insumosDisponibles,
  agregarInsumoBom,
}: {
  productoId: string;
  insumosDisponibles: Insumo[];
  agregarInsumoBom: (formData: FormData) => Promise<void>;
}) {
  const [insumoId, setInsumoId] = useState(insumosDisponibles[0]?.id || "");
  const [cantidad, setCantidad] = useState("");
  const [pending, startTransition] = useTransition();

  const insumoSeleccionado = useMemo(
    () => insumosDisponibles.find((i) => i.id === insumoId),
    [insumoId, insumosDisponibles]
  );

  if (insumosDisponibles.length === 0) {
    return (
      <div className="card">
        <h2 className="font-semibold mb-1">Agregar insumo a la fórmula</h2>
        <p className="text-sm text-brand-500">
          Ya agregaste todos los insumos activos del catálogo a esta fórmula, o todavía no has dado de alta ningún
          insumo. Ve a{" "}
          <a href="/dashboard/insumos" className="underline">
            Insumos
          </a>{" "}
          para crear más.
        </p>
      </div>
    );
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      await agregarInsumoBom(fd);
      setCantidad("");
    });
  }

  return (
    <div className="card">
      <h2 className="font-semibold mb-1">Agregar insumo a la fórmula</h2>
      <p className="text-xs text-brand-500 mb-3">
        La unidad se toma automáticamente de cómo tienes registrado el insumo (normalmente kilos) — no necesitas
        escribirla.
      </p>
      <form onSubmit={onSubmit} className="grid sm:grid-cols-[1fr_auto_auto] gap-3 items-end">
        <input type="hidden" name="producto_id" value={productoId} />
        <div>
          <label className="label">Insumo</label>
          <select
            name="insumo_id"
            className="input"
            value={insumoId}
            onChange={(e) => setInsumoId(e.target.value)}
            required
          >
            {insumosDisponibles.map((i) => (
              <option key={i.id} value={i.id}>
                {i.codigo_interno} — {i.nombre}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Cantidad por unidad</label>
          <div className="flex items-center gap-2">
            <input
              name="cantidad_por_unidad"
              type="number"
              step="0.000001"
              min="0.000001"
              className="input w-32"
              placeholder="0.000"
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
              required
            />
            <span className="text-sm text-brand-500 w-8 shrink-0">{insumoSeleccionado?.unidad_medida || "kg"}</span>
          </div>
        </div>
        <div>
          <button type="submit" className="btn-primary" disabled={pending}>
            {pending ? "Agregando…" : "Agregar"}
          </button>
        </div>
      </form>
    </div>
  );
}
