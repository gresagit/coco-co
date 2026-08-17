"use client";

import { useMemo, useState } from "react";

type Insumo = {
  id: string;
  codigo_interno: string;
  nombre: string;
  marca: string | null;
  tipo: string;
};

const CANTIDAD_DEFAULT = 12;

export default function SeleccionarCodigosInsumos({ insumos }: { insumos: Insumo[] }) {
  const tipos = useMemo(() => Array.from(new Set(insumos.map((i) => i.tipo))).sort(), [insumos]);

  const [tiposActivos, setTiposActivos] = useState<Set<string>>(new Set(tipos));
  const [busqueda, setBusqueda] = useState("");
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());
  const [cantidades, setCantidades] = useState<Record<string, number>>({});
  const [cantidadGlobal, setCantidadGlobal] = useState(CANTIDAD_DEFAULT);
  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return insumos.filter((i) => {
      if (!tiposActivos.has(i.tipo)) return false;
      if (!q) return true;
      return (
        i.nombre.toLowerCase().includes(q) ||
        i.codigo_interno.toLowerCase().includes(q) ||
        (i.marca || "").toLowerCase().includes(q)
      );
    });
  }, [insumos, tiposActivos, busqueda]);

  function toggleTipo(tipo: string) {
    setTiposActivos((prev) => {
      const next = new Set(prev);
      if (next.has(tipo)) next.delete(tipo);
      else next.add(tipo);
      return next;
    });
  }

  function toggleInsumo(id: string) {
    setSeleccionados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function seleccionarVisibles(marcar: boolean) {
    setSeleccionados((prev) => {
      const next = new Set(prev);
      for (const i of visibles) {
        if (marcar) next.add(i.id);
        else next.delete(i.id);
      }
      return next;
    });
  }

  function cantidadDe(id: string) {
    return cantidades[id] ?? cantidadGlobal;
  }

  function setCantidad(id: string, valor: number) {
    setCantidades((prev) => ({ ...prev, [id]: Math.min(Math.max(Math.round(valor) || 1, 1), 96) }));
  }

  function aplicarCantidadATodos() {
    const nuevo: Record<string, number> = {};
    for (const id of seleccionados) nuevo[id] = cantidadGlobal;
    setCantidades((prev) => ({ ...prev, ...nuevo }));
  }

  const totalEtiquetas = Array.from(seleccionados).reduce((acc, id) => acc + cantidadDe(id), 0);

  async function generarPdf() {
    setError(null);
    if (seleccionados.size === 0) {
      setError("Elige al menos un insumo.");
      return;
    }
    setGenerando(true);
    try {
      const items = Array.from(seleccionados).map((id) => ({ id, copias: cantidadDe(id) }));
      const res = await fetch("/api/insumos/barcodes/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.message || "No se pudo generar el PDF.");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noreferrer");
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (e: any) {
      setError(e.message || "No se pudo generar el PDF.");
    } finally {
      setGenerando(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="card space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Filtra por material</h2>
            <p className="text-xs text-brand-400">Elige de qué tipo de insumo quieres ver e imprimir códigos.</p>
          </div>
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre, código o marca…"
            className="input max-w-xs"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {tipos.map((tipo) => {
            const activo = tiposActivos.has(tipo);
            return (
              <button
                key={tipo}
                type="button"
                onClick={() => toggleTipo(tipo)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  activo
                    ? "bg-ink text-cream border-ink"
                    : "bg-white text-brand-500 border-brand-200 hover:border-brand-400"
                }`}
              >
                {tipo}
              </button>
            );
          })}
        </div>
      </div>

      <div className="card space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Elige cuántos códigos imprimir</h2>
            <p className="text-xs text-brand-400">
              Marca los insumos y ajusta la cantidad de copias de cada uno. Puedes fijar una cantidad para todos
              los que selecciones.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => seleccionarVisibles(true)} className="btn-secondary text-xs">
              Seleccionar visibles
            </button>
            <button type="button" onClick={() => seleccionarVisibles(false)} className="btn-secondary text-xs">
              Quitar visibles
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3 bg-brand-50 rounded-lg p-3">
          <div>
            <label className="label">Cantidad para todos los seleccionados</label>
            <input
              type="number"
              min={1}
              max={96}
              value={cantidadGlobal}
              onChange={(e) => setCantidadGlobal(Math.min(Math.max(Number(e.target.value) || 1, 1), 96))}
              className="input w-28"
            />
          </div>
          <button type="button" onClick={aplicarCantidadATodos} className="btn-secondary text-sm">
            Aplicar a seleccionados
          </button>
        </div>

        <div className="overflow-x-auto max-h-[420px] overflow-y-auto border border-brand-150 rounded-lg">
          <table className="table-base">
            <thead className="sticky top-0 bg-white">
              <tr>
                <th></th>
                <th>Código</th>
                <th>Nombre</th>
                <th>Marca</th>
                <th>Tipo</th>
                <th>Copias</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((i) => {
                const marcado = seleccionados.has(i.id);
                return (
                  <tr key={i.id} className={marcado ? "bg-brand-50/60" : ""}>
                    <td>
                      <input type="checkbox" checked={marcado} onChange={() => toggleInsumo(i.id)} />
                    </td>
                    <td className="font-mono text-xs">{i.codigo_interno}</td>
                    <td className="font-medium">{i.nombre}</td>
                    <td className="text-brand-500">{i.marca || "—"}</td>
                    <td>{i.tipo}</td>
                    <td>
                      <input
                        type="number"
                        min={1}
                        max={96}
                        disabled={!marcado}
                        value={cantidadDe(i.id)}
                        onChange={(e) => setCantidad(i.id, Number(e.target.value))}
                        className="input w-20 disabled:opacity-40"
                      />
                    </td>
                  </tr>
                );
              })}
              {visibles.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-brand-400 text-sm py-4 text-center">
                    No hay insumos que coincidan con el filtro.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <p className="text-sm text-brand-500">
            {seleccionados.size} insumo{seleccionados.size === 1 ? "" : "s"} seleccionado
            {seleccionados.size === 1 ? "" : "s"} · {totalEtiquetas} etiqueta{totalEtiquetas === 1 ? "" : "s"} en total
          </p>
          <button type="button" onClick={generarPdf} disabled={generando} className="btn-primary text-sm">
            {generando ? "Generando…" : "Generar PDF"}
          </button>
        </div>
        {error && <p className="text-sm text-red-700">{error}</p>}
      </div>
    </div>
  );
}
