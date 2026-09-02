"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";

type Insumo = {
  id: string;
  codigo_interno: string;
  nombre: string;
  unidad_medida: string;
  costo_unitario_actual: number;
};

// Etiquetas para cada unidad válida (mismo catálogo del check constraint de
// `insumos.unidad_medida`, migración 021).
const UNIDAD_LABELS: Record<string, string> = {
  kg: "kg (kilos)",
  g: "g (gramos)",
  L: "L (litros)",
  ml: "ml (mililitros)",
  pz: "pz (piezas)",
  m: "m (metros)",
};

// Solo se puede elegir otra unidad dentro de la misma familia que el insumo
// (masa, volumen, pieza o longitud), porque el costo del insumo está
// registrado por su unidad base y la conversión solo tiene sentido dentro de
// la misma familia (ej. kg <-> g, L <-> ml).
const FAMILIAS_UNIDAD: Record<string, string[]> = {
  kg: ["kg", "g"],
  g: ["kg", "g"],
  L: ["L", "ml"],
  ml: ["L", "ml"],
  pz: ["pz"],
  m: ["m"],
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
  const [unidad, setUnidad] = useState(insumosDisponibles[0]?.unidad_medida || "kg");
  const [listaAbierta, setListaAbierta] = useState(false);
  const [pending, startTransition] = useTransition();
  const contenedorRef = useRef<HTMLDivElement>(null);

  // Cierra la lista al hacer clic fuera del buscador, para que no se quede
  // flotando encima del resto del formulario.
  useEffect(() => {
    function onClickFuera(e: MouseEvent) {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target as Node)) {
        setListaAbierta(false);
      }
    }
    document.addEventListener("mousedown", onClickFuera);
    return () => document.removeEventListener("mousedown", onClickFuera);
  }, []);

  const insumoSeleccionado = useMemo(
    () => insumosDisponibles.find((i) => i.id === insumoId),
    [insumoId, insumosDisponibles]
  );
  const unidadesDisponibles = useMemo(
    () => FAMILIAS_UNIDAD[insumoSeleccionado?.unidad_medida || "kg"] || ["kg"],
    [insumoSeleccionado]
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
        La unidad se sugiere automáticamente según cómo tienes registrado el insumo, pero puedes cambiarla si en
        esta fórmula la vas a usar en otra unidad.
      </p>
      <form onSubmit={onSubmit} className="flex flex-col gap-4 xl:flex-row xl:items-end">
        <input type="hidden" name="producto_id" value={productoId} />

        <div ref={contenedorRef} className="relative w-full min-w-0 xl:flex-[2.2]">
          <label className="label">Insumo</label>
          <input type="hidden" name="insumo_id" value={insumoId} />
          <input
            type="search"
            className="input w-full"
            value={busqueda}
            onChange={(e) => {
              setBusqueda(e.target.value);
              setListaAbierta(true);
            }}
            onFocus={() => setListaAbierta(true)}
            placeholder="Busca por nombre, clave o unidad..."
            aria-label="Buscar insumo por nombre, clave o unidad"
            role="combobox"
            aria-expanded={listaAbierta}
            aria-controls="lista-insumos-bom"
          />

          {listaAbierta && (
            <div
              id="lista-insumos-bom"
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
                      setListaAbierta(false);
                      // Reinicia la unidad a la del insumo elegido, ya que las
                      // opciones disponibles dependen de su familia (masa,
                      // volumen, pieza o longitud).
                      setUnidad(i.unidad_medida);
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
          )}

          <p className="mt-2 text-xs text-brand-400">
            Seleccionado: <span className="text-ink">{insumoSeleccionado?.nombre || "ninguno"}</span>
          </p>
        </div>

        <div className="w-full sm:w-auto xl:flex-[0.7]">
          <label className="label">Cantidad por unidad</label>
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
        </div>

        <div className="w-full sm:w-auto xl:flex-[0.5]">
          <label className="label">Unidad de medida</label>
          <select
            name="unidad"
            className="input"
            value={unidad}
            onChange={(e) => setUnidad(e.target.value)}
            required
          >
            {unidadesDisponibles.map((u) => (
              <option key={u} value={u}>
                {UNIDAD_LABELS[u] || u}
              </option>
            ))}
          </select>
          {unidadesDisponibles.length > 1 && (
            <p className="mt-1 text-xs text-brand-400">
              El costo se registró en {insumoSeleccionado?.unidad_medida}; si usas otra unidad aquí, la cantidad se
              convierte automáticamente al calcular el costo.
            </p>
          )}
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
