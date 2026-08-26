"use client";

import { useMemo, useState, useTransition } from "react";

type Producto = { id: string; sku: string; nombre: string };

type LineaCarrito = {
  producto_id: string;
  nombre: string;
  sku: string;
  cantidad: number;
  precio_unitario: number;
};

type ResultadoVenta = { ok: boolean; message?: string };

export default function VentaCarrito({
  productos,
  registrarVentaCarrito,
}: {
  productos: Producto[];
  registrarVentaCarrito: (formData: FormData) => Promise<ResultadoVenta>;
}) {
  const [carrito, setCarrito] = useState<LineaCarrito[]>([]);
  const [productoId, setProductoId] = useState("");
  const [cantidad, setCantidad] = useState("");
  const [precio, setPrecio] = useState("");
  const [medioPago, setMedioPago] = useState("Efectivo");
  const [folioPos, setFolioPos] = useState("");
  const [notas, setNotas] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const productosPorId = useMemo(() => new Map(productos.map((p) => [p.id, p])), [productos]);

  // Agregar un producto al carrito es puramente local (sin round-trip al
  // servidor ni recarga de página): es lo que hace eficiente vender varios
  // productos seguidos. Solo se toca la base de datos una vez, al confirmar
  // toda la venta.
  function agregarLinea() {
    setError(null);
    setExito(null);
    const prod = productosPorId.get(productoId);
    const cant = Number(cantidad);
    const prec = Number(precio || 0);

    if (!prod) {
      setError("Selecciona un producto para agregar.");
      return;
    }
    if (!cant || cant <= 0) {
      setError("La cantidad debe ser mayor a 0.");
      return;
    }
    if (prec < 0) {
      setError("El precio unitario no puede ser negativo.");
      return;
    }

    setCarrito((prev) => {
      const idx = prev.findIndex((l) => l.producto_id === prod.id && l.precio_unitario === prec);
      if (idx >= 0) {
        const copia = [...prev];
        copia[idx] = { ...copia[idx], cantidad: copia[idx].cantidad + cant };
        return copia;
      }
      return [...prev, { producto_id: prod.id, nombre: prod.nombre, sku: prod.sku, cantidad: cant, precio_unitario: prec }];
    });

    setProductoId("");
    setCantidad("");
    setPrecio("");
  }

  function quitarLinea(index: number) {
    setCarrito((prev) => prev.filter((_, i) => i !== index));
  }

  function actualizarCantidad(index: number, valor: string) {
    const cant = Number(valor);
    setCarrito((prev) => prev.map((l, i) => (i === index ? { ...l, cantidad: cant } : l)));
  }

  const total = carrito.reduce((acc, l) => acc + l.cantidad * l.precio_unitario, 0);

  function confirmarVenta() {
    setError(null);
    setExito(null);
    if (carrito.length === 0) {
      setError("Agrega al menos un producto a la venta antes de registrarla.");
      return;
    }
    if (carrito.some((l) => !l.cantidad || l.cantidad <= 0)) {
      setError("Hay una línea con cantidad inválida.");
      return;
    }

    const formData = new FormData();
    formData.set("items_json", JSON.stringify(carrito.map((l) => ({
      producto_id: l.producto_id,
      cantidad: l.cantidad,
      precio_unitario: l.precio_unitario,
    }))));
    formData.set("medio_pago", medioPago);
    formData.set("folio_pos", folioPos);
    formData.set("notas", notas);

    startTransition(async () => {
      const res = await registrarVentaCarrito(formData);
      if (!res.ok) {
        setError(res.message || "No se pudo registrar la venta.");
        return;
      }
      setCarrito([]);
      setFolioPos("");
      setNotas("");
      setExito("Venta registrada correctamente.");
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-4 gap-3 items-end">
        <div className="md:col-span-2">
          <label className="label">Producto</label>
          <select className="input" value={productoId} onChange={(e) => setProductoId(e.target.value)}>
            <option value="">— Selecciona —</option>
            {productos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre} ({p.sku})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Cantidad</label>
          <input
            type="number"
            step="0.01"
            min="0.01"
            className="input"
            value={cantidad}
            onChange={(e) => setCantidad(e.target.value)}
          />
        </div>
        <div>
          <label className="label">Precio unitario</label>
          <input
            type="number"
            step="0.01"
            min="0"
            className="input"
            value={precio}
            onChange={(e) => setPrecio(e.target.value)}
          />
        </div>
        <div className="md:col-span-4">
          <button type="button" onClick={agregarLinea} className="btn-secondary">
            + Agregar producto a la venta
          </button>
        </div>
      </div>

      {carrito.length > 0 && (
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>Producto</th>
                <th>Cantidad</th>
                <th>Precio unitario</th>
                <th>Subtotal</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {carrito.map((l, i) => (
                <tr key={`${l.producto_id}-${i}`}>
                  <td className="font-medium">{l.nombre} <span className="text-xs text-brand-400">({l.sku})</span></td>
                  <td>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      className="input !w-24 !py-1"
                      value={l.cantidad}
                      onChange={(e) => actualizarCantidad(i, e.target.value)}
                    />
                  </td>
                  <td>${l.precio_unitario.toFixed(2)}</td>
                  <td className="font-medium">${(l.cantidad * l.precio_unitario).toFixed(2)}</td>
                  <td>
                    <button type="button" onClick={() => quitarLinea(i)} className="text-red-600 text-xs underline">
                      Quitar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-3">
        <div>
          <label className="label">Medio de pago</label>
          <select className="input" value={medioPago} onChange={(e) => setMedioPago(e.target.value)}>
            <option>Efectivo</option>
            <option>Tarjeta</option>
            <option>Transferencia</option>
            <option>Otro</option>
          </select>
        </div>
        <div>
          <label className="label">Folio / ticket (opcional)</label>
          <input className="input" value={folioPos} onChange={(e) => setFolioPos(e.target.value)} placeholder="Ej. número de ticket" />
        </div>
        <div>
          <label className="label">Notas (opcional)</label>
          <input className="input" value={notas} onChange={(e) => setNotas(e.target.value)} />
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {exito && <p className="text-sm text-green-700">{exito}</p>}

      <div className="flex items-center justify-between">
        <p className="font-serif text-xl text-ink">Total: ${total.toFixed(2)}</p>
        <button type="button" onClick={confirmarVenta} disabled={pending || carrito.length === 0} className="btn-primary">
          {pending ? "Registrando…" : "Registrar venta"}
        </button>
      </div>
    </div>
  );
}
