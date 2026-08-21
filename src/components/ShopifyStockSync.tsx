"use client";

import { useState } from "react";

type Fila = {
  sku: string;
  tituloShopify: string;
  cantidadShopify: number;
  productoId: string | null;
  nombreLocal: string | null;
  cantidadLocal: number | null;
};

export default function ShopifyStockSync({ conectado }: { conectado: boolean }) {
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filas, setFilas] = useState<Fila[] | null>(null);
  const [aplicando, setAplicando] = useState<string | null>(null);
  const [aplicados, setAplicados] = useState<Record<string, number>>({});

  async function sincronizar() {
    setCargando(true);
    setError(null);
    try {
      const res = await fetch("/api/shopify/sync", { method: "POST" });
      const data = await res.json();
      if (!data.ok) {
        setError(data.mensaje || "No se pudo sincronizar.");
        setFilas(null);
      } else {
        setFilas(data.comparacion);
      }
    } catch {
      setError("No se pudo conectar con el servidor.");
    } finally {
      setCargando(false);
    }
  }

  async function aplicar(fila: Fila) {
    if (!fila.productoId) return;
    setAplicando(fila.sku);
    try {
      const res = await fetch("/api/shopify/aplicar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productoId: fila.productoId, cantidadShopify: fila.cantidadShopify }),
      });
      const data = await res.json();
      if (data.ok) {
        setAplicados((prev) => ({ ...prev, [fila.sku]: data.nuevaCantidad }));
      }
    } finally {
      setAplicando(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-brand-500">
          {conectado
            ? "Trae el inventario actual desde Shopify y compáralo contra el stock local por SKU."
            : "Guarda el dominio y access token de tu tienda arriba para poder sincronizar."}
        </p>
        <button type="button" onClick={sincronizar} disabled={!conectado || cargando} className="btn-primary text-sm disabled:opacity-50">
          {cargando ? "Sincronizando…" : "Sincronizar ahora"}
        </button>
      </div>

      {error && (
        <div className="card !py-4 border-2 border-red-600 bg-red-50">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {filas && (
        <div className="card overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Producto Shopify</th>
                <th>Stock Shopify</th>
                <th>Producto local</th>
                <th>Stock local</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => {
                const cantidadLocalMostrada = aplicados[f.sku] ?? f.cantidadLocal;
                const diferente = f.productoId && cantidadLocalMostrada !== f.cantidadShopify;
                return (
                  <tr key={f.sku}>
                    <td className="font-mono text-xs">{f.sku}</td>
                    <td>{f.tituloShopify}</td>
                    <td className="font-medium">{f.cantidadShopify}</td>
                    <td>
                      {f.nombreLocal || <span className="text-brand-400">Sin coincidencia de SKU</span>}
                    </td>
                    <td className={diferente ? "font-medium text-accent-600" : ""}>
                      {f.productoId ? cantidadLocalMostrada : "—"}
                    </td>
                    <td>
                      {f.productoId && diferente && (
                        <button
                          type="button"
                          onClick={() => aplicar(f)}
                          disabled={aplicando === f.sku}
                          className="btn-secondary !py-1 !px-2.5 text-xs disabled:opacity-50"
                        >
                          {aplicando === f.sku ? "Aplicando…" : "Aplicar a local"}
                        </button>
                      )}
                      {f.productoId && !diferente && <span className="text-xs text-green-700">Igualado</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
