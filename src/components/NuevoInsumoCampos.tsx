"use client";

import { useState } from "react";

const UNIDAD_SUGERIDA: Record<string, string> = {
  "Materia Prima": "kg",
  Empaque: "pz",
  Etiqueta: "pz",
  "Producto Intermedio": "kg",
};

export default function NuevoInsumoCampos({ sucursalNombre }: { sucursalNombre?: string }) {
  const [tipo, setTipo] = useState("Materia Prima");
  const [unidad, setUnidad] = useState("kg");
  const [unidadTocadaAMano, setUnidadTocadaAMano] = useState(false);
  const [cantidad, setCantidad] = useState("");
  const [subtotal, setSubtotal] = useState("");
  const [ivaPorcentaje, setIvaPorcentaje] = useState("");
  const [ivaIncluido, setIvaIncluido] = useState(false);
  const [envio, setEnvio] = useState("");

  const cantidadNumero = Number(cantidad);
  const subtotalNumero = Number(subtotal);
  const ivaNumero = ivaIncluido ? 0 : subtotalNumero * (Number(ivaPorcentaje) / 100);
  const totalNumero = subtotalNumero + ivaNumero + Number(envio || 0);
  const costoUnitario = cantidadNumero > 0 && totalNumero > 0 ? totalNumero / cantidadNumero : null;

  function onTipoChange(nuevoTipo: string) {
    setTipo(nuevoTipo);
    if (!unidadTocadaAMano) setUnidad(UNIDAD_SUGERIDA[nuevoTipo] || "kg");
  }

  return (
    <>
      <div>
        <label className="label">Tipo</label>
        <select name="tipo" className="input" value={tipo} onChange={(event) => onTipoChange(event.target.value)} required>
          <option>Materia Prima</option>
          <option>Empaque</option>
          <option>Etiqueta</option>
          <option>Producto Intermedio</option>
        </select>
        <p className="text-xs text-brand-400 mt-1">Define el prefijo del código.</p>
      </div>
      <div>
        <label className="label">Unidad de medida</label>
        <select
          name="unidad_medida"
          className="input"
          value={unidad}
          onChange={(event) => {
            setUnidad(event.target.value);
            setUnidadTocadaAMano(true);
          }}
          required
        >
          <option value="kg">kg (kilogramos)</option>
          <option value="g">g (gramos)</option>
          <option value="L">L (litros)</option>
          <option value="ml">ml (mililitros)</option>
          <option value="pz">pz (piezas)</option>
          <option value="m">m (metros)</option>
        </select>
        <p className="text-xs text-brand-400 mt-1">Esta unidad se usará en stock, entradas y costo unitario.</p>
      </div>
      <div>
        <label className="label">
          Cantidad inicial ({unidad}) {sucursalNombre && <span className="text-brand-400 font-normal">({sucursalNombre})</span>}
        </label>
        <input name="cantidad_inicial" type="number" step="0.01" min={0} className="input" placeholder={`Ej. 100 ${unidad}`} value={cantidad} onChange={(event) => setCantidad(event.target.value)} />
      </div>
      <div>
        <label className="label">Subtotal de compra</label>
        <input name="costo_subtotal_inicial" type="number" step="0.01" min={0} className="input" placeholder="Ej. 200" value={subtotal} onChange={(event) => setSubtotal(event.target.value)} />
      </div>
      <div>
        <label className="label">IVA (%)</label>
        <input name="iva_porcentaje_inicial" type="number" step="0.01" min={0} className="input" placeholder="Ej. 16" value={ivaPorcentaje} onChange={(event) => setIvaPorcentaje(event.target.value)} />
        <label className="mt-1 flex items-center gap-2 text-xs text-brand-500">
          <input name="iva_incluido_inicial" type="checkbox" checked={ivaIncluido} onChange={(event) => setIvaIncluido(event.target.checked)} />
          IVA incluido en subtotal
        </label>
      </div>
      <div>
        <label className="label">Envío</label>
        <input name="envio_inicial" type="number" step="0.01" min={0} className="input" placeholder="Ej. 50" value={envio} onChange={(event) => setEnvio(event.target.value)} />
        <p className="text-xs text-brand-400 mt-1">
          {costoUnitario !== null
            ? `Total: $${totalNumero.toFixed(2)} · costo: $${costoUnitario.toFixed(4)} por ${unidad}`
            : `El costo por ${unidad} incluye subtotal, IVA y envío.`}
        </p>
      </div>
    </>
  );
}