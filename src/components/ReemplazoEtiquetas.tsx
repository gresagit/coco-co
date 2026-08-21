"use client";

import { useState } from "react";

type Pieza = { id: string; folio_pieza: string; estado: string };

export default function ReemplazoEtiquetas({ generacionId, piezas }: { generacionId: string; piezas: Pieza[] }) {
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [textoNumeros, setTextoNumeros] = useState("");
  const [motivo, setMotivo] = useState("Etiqueta dañada");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState<string | null>(null);

  function toggle(id: string) {
    setSeleccion((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // Convierte texto tipo "7-20, 1, 4, 9" en posiciones (1-based, según el
  // orden en que se ven las etiquetas aquí) y las agrega a la selección.
  function marcarPorNumeros() {
    setError(null);
    const partes = textoNumeros.split(",").map((p) => p.trim()).filter(Boolean);
    if (!partes.length) return;

    const nuevos = new Set(seleccion);
    for (const parte of partes) {
      const rango = parte.match(/^(\d+)\s*-\s*(\d+)$/);
      if (rango) {
        let [ini, fin] = [Number(rango[1]), Number(rango[2])];
        if (ini > fin) [ini, fin] = [fin, ini];
        for (let n = ini; n <= fin; n++) {
          const p = piezas[n - 1];
          if (p) nuevos.add(p.id);
        }
      } else if (/^\d+$/.test(parte)) {
        const p = piezas[Number(parte) - 1];
        if (p) nuevos.add(p.id);
      } else {
        setError(`No entendí "${parte}" — usa números o rangos, ej. 7-20, 1, 4, 9`);
        return;
      }
    }
    setSeleccion(nuevos);
    setTextoNumeros("");
  }

  async function generarReemplazo() {
    if (!seleccion.size) return;
    setEnviando(true);
    setError(null);
    setListo(null);
    try {
      const ids = Array.from(seleccion);
      const res = await fetch(`/api/codigos-barra/${generacionId}/reemplazo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ piezaIds: ids, motivo }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.mensaje || "No se pudo registrar el reemplazo.");
        return;
      }
      window.open(`/api/codigos-barra/${generacionId}/reemplazo/pdf?piezas=${ids.join(",")}`, "_blank");
      setListo(`${ids.length} etiqueta(s) marcadas como reimpresas. Se abrió el PDF con solo esas.`);
      setSeleccion(new Set());
    } catch {
      setError("No se pudo conectar con el servidor.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="label">Marca por número o rango</label>
        <div className="flex flex-wrap gap-2">
          <input
            value={textoNumeros}
            onChange={(e) => setTextoNumeros(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                marcarPorNumeros();
              }
            }}
            placeholder="Ej. 7-20, 1, 4, 9"
            className="input !w-64"
          />
          <button type="button" onClick={marcarPorNumeros} className="btn-secondary text-sm">
            Marcar
          </button>
          {seleccion.size > 0 && (
            <button type="button" onClick={() => setSeleccion(new Set())} className="text-xs text-brand-500 underline">
              Quitar selección ({seleccion.size})
            </button>
          )}
        </div>
        <p className="text-xs text-brand-400 mt-1">
          El número es la posición de la etiqueta en la cuadrícula de abajo — también puedes darle clic directo a
          cada una.
        </p>
      </div>

      <div className="grid grid-cols-3 md:grid-cols-6 gap-2 text-xs">
        {piezas.map((p, i) => {
          const marcada = seleccion.has(p.id);
          return (
            <button
              type="button"
              key={p.id}
              onClick={() => toggle(p.id)}
              className={`font-mono rounded px-2 py-1.5 text-center border transition-colors ${
                marcada
                  ? "bg-accent-100 border-accent-400 text-accent-700"
                  : "bg-brand-50 border-transparent hover:border-brand-200"
              }`}
              title={p.estado}
            >
              <span className="block text-[10px] text-brand-400">#{i + 1}</span>
              {p.folio_pieza}
            </button>
          );
        })}
      </div>

      {seleccion.size > 0 && (
        <div className="flex flex-wrap items-end gap-3 border-t border-brand-150 pt-4">
          <div className="flex-1 min-w-[200px]">
            <label className="label">Motivo</label>
            <input value={motivo} onChange={(e) => setMotivo(e.target.value)} className="input" />
          </div>
          <button type="button" onClick={generarReemplazo} disabled={enviando} className="btn-primary text-sm disabled:opacity-50">
            {enviando ? "Generando…" : `Generar reemplazo (${seleccion.size})`}
          </button>
        </div>
      )}

      {error && <p className="text-sm text-red-700">{error}</p>}
      {listo && <p className="text-sm text-green-700">{listo}</p>}
    </div>
  );
}
