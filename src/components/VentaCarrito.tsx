"use client";

import { useMemo, useState, useTransition } from "react";

type Producto = { id: string; sku: string; nombre: string; precio_venta: number };

type TipoCliente = "ocasional" | "mayorista";

type LineaCarrito = {
  producto_id: string;
  nombre: string;
  sku: string;
  cantidad: number;
  precio_unitario: number;
};

type ResultadoVenta = { ok: boolean; message?: string; folio?: string };

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
  const [clienteTipo, setClienteTipo] = useState<TipoCliente>("ocasional");
  const [clienteNombre, setClienteNombre] = useState("");
  const [clienteApellido, setClienteApellido] = useState("");
  const [clienteTelefono, setClienteTelefono] = useState("");
  const [clienteEmpresa, setClienteEmpresa] = useState("");
  const [clienteResponsable, setClienteResponsable] = useState("");
  const [clienteTelefonoResponsable, setClienteTelefonoResponsable] = useState("");
  const [clienteCorreoResponsable, setClienteCorreoResponsable] = useState("");
  const [clienteLugarOrigen, setClienteLugarOrigen] = useState("");
  const [clienteVolumenCompra, setClienteVolumenCompra] = useState("");
  const [clienteProductosInteres, setClienteProductosInteres] = useState("");
  const [medioPago, setMedioPago] = useState("Efectivo");
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

    if (!prod) {
      setError("Selecciona un producto para agregar.");
      return;
    }
    if (!cant || cant <= 0) {
      setError("La cantidad debe ser mayor a 0.");
      return;
    }
    setCarrito((prev) => {
      const idx = prev.findIndex((l) => l.producto_id === prod.id);
      if (idx >= 0) {
        const copia = [...prev];
        copia[idx] = { ...copia[idx], cantidad: copia[idx].cantidad + cant };
        return copia;
      }
      return [...prev, { producto_id: prod.id, nombre: prod.nombre, sku: prod.sku, cantidad: cant, precio_unitario: prod.precio_venta }];
    });

    setProductoId("");
    setCantidad("");
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
    }))));
    formData.set("cliente_tipo", clienteTipo);
    formData.set("cliente_nombre", clienteNombre);
    formData.set("cliente_apellido", clienteApellido);
    formData.set("cliente_telefono", clienteTelefono);
    formData.set("cliente_empresa", clienteEmpresa);
    formData.set("cliente_responsable", clienteResponsable);
    formData.set("cliente_telefono_responsable", clienteTelefonoResponsable);
    formData.set("cliente_correo_responsable", clienteCorreoResponsable);
    formData.set("cliente_lugar_origen", clienteLugarOrigen);
    formData.set("cliente_volumen_compra", clienteVolumenCompra);
    formData.set("cliente_productos_interes", clienteProductosInteres);
    formData.set("medio_pago", medioPago);
    formData.set("notas", notas);

    startTransition(async () => {
      const res = await registrarVentaCarrito(formData);
      if (!res.ok) {
        setError(res.message || "No se pudo registrar la venta.");
        return;
      }
      setCarrito([]);
      setClienteNombre("");
      setClienteApellido("");
      setClienteTelefono("");
      setClienteEmpresa("");
      setClienteResponsable("");
      setClienteTelefonoResponsable("");
      setClienteCorreoResponsable("");
      setClienteLugarOrigen("");
      setClienteVolumenCompra("");
      setClienteProductosInteres("");
      setNotas("");
      setExito(`Venta ${res.folio || ""} registrada correctamente.`);
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
          <p className="input bg-brand-50 text-ink">
            {productosPorId.get(productoId)?.precio_venta
              ? `$${productosPorId.get(productoId)!.precio_venta.toFixed(2)}`
              : "Se calcula automáticamente"}
          </p>
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

      <div className="space-y-3 border border-brand-100 rounded-xl p-3 bg-brand-50/40">
        <div>
          <label className="label">Tipo de cliente</label>
          <div className="flex gap-4 mt-1">
            <label className="inline-flex items-center gap-2 text-sm text-ink">
              <input type="radio" name="cliente_tipo" value="ocasional" checked={clienteTipo === "ocasional"} onChange={() => setClienteTipo("ocasional")} />
              Ocasional
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-ink">
              <input type="radio" name="cliente_tipo" value="mayorista" checked={clienteTipo === "mayorista"} onChange={() => setClienteTipo("mayorista")} />
              Mayorista
            </label>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <label className="label">Nombre</label>
            <input className="input" value={clienteNombre} onChange={(e) => setClienteNombre(e.target.value)} placeholder="Ej. Ana" />
          </div>
          <div>
            <label className="label">Apellido</label>
            <input className="input" value={clienteApellido} onChange={(e) => setClienteApellido(e.target.value)} placeholder="Ej. López" />
          </div>
          <div className="md:col-span-2">
            <label className="label">Teléfono</label>
            <input className="input" value={clienteTelefono} onChange={(e) => setClienteTelefono(e.target.value)} placeholder="Ej. 555 123 4567" />
          </div>
        </div>

        {clienteTipo === "mayorista" && (
          <div className="grid md:grid-cols-2 gap-3 border-t border-brand-100 pt-3">
            <div>
              <label className="label">Nombre de la empresa</label>
              <input className="input" value={clienteEmpresa} onChange={(e) => setClienteEmpresa(e.target.value)} placeholder="Ej. Distribuidora Cococo" />
            </div>
            <div>
              <label className="label">Nombre del responsable</label>
              <input className="input" value={clienteResponsable} onChange={(e) => setClienteResponsable(e.target.value)} placeholder="Ej. Patricia García" />
            </div>
            <div>
              <label className="label">Número del responsable</label>
              <input className="input" value={clienteTelefonoResponsable} onChange={(e) => setClienteTelefonoResponsable(e.target.value)} placeholder="Ej. 555 987 6543" />
            </div>
            <div>
              <label className="label">Correo del responsable</label>
              <input className="input" type="email" value={clienteCorreoResponsable} onChange={(e) => setClienteCorreoResponsable(e.target.value)} placeholder="correo@empresa.com" />
            </div>
            <div>
              <label className="label">De dónde es</label>
              <input className="input" value={clienteLugarOrigen} onChange={(e) => setClienteLugarOrigen(e.target.value)} placeholder="Ej. Guadalajara, Jalisco" />
            </div>
            <div>
              <label className="label">Cuánto compra</label>
              <input className="input" value={clienteVolumenCompra} onChange={(e) => setClienteVolumenCompra(e.target.value)} placeholder="Ej. Compra semanal / mensual / grande" />
            </div>
            <div className="md:col-span-2">
              <label className="label">Productos de interés</label>
              <input className="input" value={clienteProductosInteres} onChange={(e) => setClienteProductosInteres(e.target.value)} placeholder="Opcional: productos o categorías de interés" />
            </div>
          </div>
        )}
      </div>

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
