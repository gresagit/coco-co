"use client";

import { useState } from "react";

const UNIDAD_SUGERIDA: Record<string, string> = {
  "Materia Prima": "kg",
  Empaque: "pz",
  Etiqueta: "pz",
  "Producto Intermedio": "kg",
};

export default function InsumoTipoUnidad() {
  const [tipo, setTipo] = useState("Materia Prima");
  const [unidad, setUnidad] = useState(UNIDAD_SUGERIDA["Materia Prima"]);
  const [unidadTocadaAMano, setUnidadTocadaAMano] = useState(false);

  function onTipoChange(nuevoTipo: string) {
    setTipo(nuevoTipo);
    // Solo autocompleta la unidad si el usuario no la cambió manualmente antes
    // (para no pisarle una elección a propósito, ej. etiquetas que a veces se
    // compran por rollo/metro).
    if (!unidadTocadaAMano) {
      setUnidad(UNIDAD_SUGERIDA[nuevoTipo] || "kg");
    }
  }

  return (
    <>
      <div>
        <label className="label">Tipo</label>
        <select name="tipo" className="input" value={tipo} onChange={(e) => onTipoChange(e.target.value)} required>
          <option>Materia Prima</option>
          <option>Empaque</option>
          <option>Etiqueta</option>
          <option>Producto Intermedio</option>
        </select>
        <p className="text-xs text-brand-400 mt-1">Define el prefijo del código (ej. Empaque → EMP-0001).</p>
      </div>
      <div>
        <label className="label">Unidad de medida</label>
        <select
          name="unidad_medida"
          className="input"
          value={unidad}
          onChange={(e) => {
            setUnidad(e.target.value);
            setUnidadTocadaAMano(true);
          }}
          required
        >
          <option value="kg">kg</option>
          <option value="g">g (gramos)</option>
          <option value="L">L</option>
          <option value="ml">ml (mililitros)</option>
          <option value="pz">pz</option>
          <option value="m">m</option>
        </select>
        <p className="text-xs text-brand-400 mt-1">
          {tipo === "Empaque" || tipo === "Etiqueta"
            ? "Sugerido \"pz\" porque este tipo casi siempre se cuenta por pieza."
            : "Sugerido \"kg\" — cámbialo si este insumo se compra o se usa en receta por gramo, litro, mililitro, pieza o metro."}
        </p>
      </div>
    </>
  );
}
