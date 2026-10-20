"use client";

import { useState } from "react";
import { unidadesPermitidasPara } from "@/lib/unidades";

const UNIDAD_SUGERIDA: Record<string, string> = {
  "Materia Prima": "kg",
  Empaque: "pz",
  Etiqueta: "pz",
  "Producto Intermedio": "kg",
};

const UNIDAD_LABELS: Record<string, string> = {
  kg: "kg (kilogramos)",
  g: "g (gramos)",
  L: "L (litros)",
  ml: "ml (mililitros)",
  pz: "pz (piezas)",
  m: "m (metros)",
};

export default function NuevoInsumoCampos({ sucursalNombre }: { sucursalNombre?: string }) {
  const [tipo, setTipo] = useState("Materia Prima");
  const [unidad, setUnidad] = useState("kg");
  const [unidadPrecio, setUnidadPrecio] = useState<"kg" | "g">("kg");
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
  const cantidadEnUnidadBase = unidad === "g" ? cantidadNumero / 1000 : cantidadNumero;
  const unidadBase = unidad === "g" ? "kg" : unidad;
  const costoUnitario = cantidadEnUnidadBase > 0 && totalNumero > 0 ? totalNumero / cantidadEnUnidadBase : null;
  const esUnidadDeMasa = unidad === "kg" || unidad === "g";
  const costoMostrado =
    costoUnitario !== null && unidadPrecio === "g" ? costoUnitario / 1000 : costoUnitario;

  const unidadesDisponibles = unidadesPermitidasPara(tipo);

  function onTipoChange(nuevoTipo: string) {
    setTipo(nuevoTipo);
    const disponiblesNuevoTipo = unidadesPermitidasPara(nuevoTipo);
    // Si el usuario no había tocado la unidad a mano, sigue autocompletando
    // la sugerida. Si sí la había cambiado pero esa unidad ya no aplica para
    // el nuevo tipo (ej. traía "L" y cambia a Materia Prima), hay que
    // corregirla de todos modos para no dejar un valor inválido seleccionado.
    if (!unidadTocadaAMano || !disponiblesNuevoTipo.includes(unidad)) {
      setUnidad(UNIDAD_SUGERIDA[nuevoTipo] || disponiblesNuevoTipo[0]);
    }
  }

  return (
    <>
      <div>
        <label htmlFor="insumo-tipo" className="label">Tipo</label>
        <select id="insumo-tipo" name="tipo" className="input" value={tipo} onChange={(event) => onTipoChange(event.target.value)} required>
          <option>Materia Prima</option>
          <option>Empaque</option>
          <option>Etiqueta</option>
          <option>Producto Intermedio</option>
        </select>
        <p className="text-xs text-brand-400 mt-1">Define el prefijo del código.</p>
      </div>
      <div>
        <label htmlFor="insumo-unidad-medida" className="label">Unidad de medida</label>
        <select
          id="insumo-unidad-medida"
          name="unidad_medida"
          className="input"
          value={unidad}
          onChange={(event) => {
            setUnidad(event.target.value);
            setUnidadTocadaAMano(true);
          }}
          required
        >
          {unidadesDisponibles.map((u) => (
            <option key={u} value={u}>
              {UNIDAD_LABELS[u] || u}
            </option>
          ))}
        </select>
        <p className="text-xs text-brand-400 mt-1">
          {tipo === "Materia Prima" || tipo === "Producto Intermedio"
            ? "Las fórmulas (BOM) están capturadas en kilos: usa kg o g. Elige \"pz\" solo si este insumo en realidad se cuenta por pieza y no por peso (ej. jabón pre-pastillado)."
            : "Esta unidad se usará en stock, entradas y costo unitario."}
        </p>
      </div>
      <div>
        <label htmlFor="insumo-cantidad-inicial" className="label">
          Cantidad inicial ({unidad}) {sucursalNombre && <span className="text-brand-400 font-normal">({sucursalNombre})</span>}
        </label>
        <input id="insumo-cantidad-inicial" name="cantidad_inicial" type="number" step="0.01" min={0} className="input" placeholder={`Ej. 100 ${unidad}`} value={cantidad} onChange={(event) => setCantidad(event.target.value)} />
        {unidad === "g" && <p className="text-xs text-brand-400 mt-1">Se convertirá a kg al guardar el stock (1,000 g = 1 kg).</p>}
      </div>
      <div>
        <label htmlFor="insumo-subtotal-compra" className="label">Subtotal de compra</label>
        <input id="insumo-subtotal-compra" name="costo_subtotal_inicial" type="number" step="0.01" min={0} className="input" placeholder="Ej. 200" value={subtotal} onChange={(event) => setSubtotal(event.target.value)} />
      </div>
      <div>
        <label htmlFor="insumo-iva-porcentaje" className="label">IVA (%)</label>
        <select id="insumo-iva-porcentaje" name="iva_porcentaje_inicial" className="input" value={ivaPorcentaje} onChange={(event) => setIvaPorcentaje(event.target.value)}>
          <option value="">0%</option>
          <option value="0">0%</option>
          <option value="8">8%</option>
          <option value="16">16%</option>
          <option value="18">18%</option>
          <option value="20">20%</option>
        </select>
        <label className="mt-1 flex items-center gap-2 text-xs text-brand-500">
          <input id="insumo-iva-incluido" name="iva_incluido_inicial" type="checkbox" checked={ivaIncluido} onChange={(event) => setIvaIncluido(event.target.checked)} />
          IVA incluido en subtotal
        </label>
      </div>
      <div>
        <label htmlFor="insumo-envio" className="label">Envío</label>
        <input id="insumo-envio" name="envio_inicial" type="number" step="0.01" min={0} className="input" placeholder="Ej. 50" value={envio} onChange={(event) => setEnvio(event.target.value)} />
        <div className="mt-1">
          {esUnidadDeMasa && (
            <div className="mb-2 flex items-center gap-1" role="group" aria-label="Unidad para mostrar el costo">
              <span className="mr-1 text-xs text-brand-400">Mostrar precio:</span>
              {(["kg", "g"] as const).map((u) => (
                <button
                  key={u}
                  type="button"
                  aria-pressed={unidadPrecio === u}
                  onClick={() => setUnidadPrecio(u)}
                  className={`rounded-md border px-2 py-1 text-xs ${
                    unidadPrecio === u
                      ? "border-brand-500 bg-brand-50 font-semibold text-brand-700"
                      : "border-brand-200 text-brand-500 hover:bg-brand-50"
                  }`}
                >
                  por {u}
                </button>
              ))}
            </div>
          )}
          <p className="text-xs text-brand-400">
            {costoMostrado !== null
              ? `Total: $${totalNumero.toFixed(2)} · costo: $${costoMostrado.toFixed(4)} por ${esUnidadDeMasa ? unidadPrecio : unidadBase}`
              : `El costo por ${esUnidadDeMasa ? unidadPrecio : unidadBase} incluye subtotal, IVA y envío.`}
          </p>
        </div>
      </div>
    </>
  );
}