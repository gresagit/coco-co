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
  const [busqueda, setBusqueda] = useState("");
  const [cantidad, setCantidad] = useState("");
  const [pending, startTransition] = useTransition();

  const insumoSeleccionado = useMemo(
    () => insumosDisponibles.find((i) => i.id === insumoId),
    [insumoId, insumosDisponibles]
  );
  const insumosFiltrados = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    if (!texto) return insumosDisponibles;
    return insumosDisponibles.filter((i) =>
      `${i.nombre} ${i.codigo_interno} ${i.unidad_medida}`.toLowerCase().includes(texto)
    );
  }, [busqueda, insumosDisponibles]);

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
      <form onSubmit={onSubmit} className="flex flex-col gap-4 xl:flex-row xl:items-end">
        <input type="hidden" name="producto_id" value={productoId} />

        <div className="relative w-full min-w-0 xl:flex-[2.2]">
          <label className="label">Insumo</label>
          <input type="hidden" name="insumo_id" value={insumoId} />
          <input
            type="search"
            className="input w-full"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Busca por nombre, clave o unidad..."
            aria-label="Buscar insumo por nombre, clave o unidad"
          />

          <div
            className="absolute left-0 right-0 top-full z-30 mt-2 max-h-44 overflow-y-auto rounded-xl border border-brand-150 bg-surface shadow-lg shadow-brand-100/60"
            role="listbox"
            aria-label="Resultados de insumos"
          >
            {insumosFiltrados.length === 0 ? (
              <p className="px-3 py-2 text-xs text-brand-400">No encontramos ese insumo.</p>
            ) : (
              insumosFiltrados.map((i) => (
                <button
                  key={i.id}
                  type="button"
                  role="option"
                  aria-selected={i.id === insumoId}
                  onClick={() => {
                    setInsumoId(i.id);
                    setBusqueda(i.nombre);
                  }}
                  className={`w-full text-left px-3 py-2.5 text-sm border-b border-brand-100 last:border-0 transition-colors ${
                    i.id === insumoId ? "bg-brand-50 text-ink font-medium" : "text-brand-600 hover:bg-brand-50/70"
                  }`}
                >
                  <span className="block">{i.nombre}</span>
                  <span className="block text-xs text-brand-400">{i.codigo_interno} · {i.unidad_medida}</span>
                </button>
              ))
            )}
          </div>

          <p className="mt-2 text-xs text-brand-400">
            Seleccionado: <span className="text-ink">{insumoSeleccionado?.nombre || "ninguno"}</span>
          </p>
        </div>

        <div className="w-full sm:w-auto xl:flex-[0.7]">
          <label className="label">Cantidad por unidad</label>
          <div className="flex items-center gap-2">
            <input
              name="cantidad_por_unidad"
              type="number"
              step="0.000001"
              min="0.000001"
              className="input min-w-0 w-full sm:w-28"
              placeholder="0.000"
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
              required
            />
            <span className="text-sm text-brand-500 w-10 shrink-0 text-right">
              {insumoSeleccionado?.unidad_medida || "kg"}
            </span>
          </div>
        </div>

        <div className="w-full sm:w-auto xl:flex-[0.3]">
          <button type="submit" className="btn-primary w-full sm:w-auto" disabled={pending}>
            {pending ? "Agregando…" : "Agregar"}
          </button>
        </div>
      </form>
    </div>
  );
}
