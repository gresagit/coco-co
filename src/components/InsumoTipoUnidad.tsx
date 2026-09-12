"use client";

import { useState } from "react";
import { unidadesPermitidasPara } from "@/lib/unidades";

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
  const unidadesDisponibles = unidadesPermitidasPara(tipo);

  function onTipoChange(nuevoTipo: string) {
    setTipo(nuevoTipo);
    const disponiblesNuevoTipo = unidadesPermitidasPara(nuevoTipo);
    // Solo autocompleta la unidad si el usuario no la cambió manualmente antes
    // (para no pisarle una elección a propósito, ej. etiquetas que a veces se
    // compran por rollo/metro). Si la que traía ya no aplica al nuevo tipo
    // (ej. Materia Prima ya no admite "L"), se corrige de todos modos.
    if (!unidadTocadaAMano || !disponiblesNuevoTipo.includes(unidad)) {
      setUnidad(UNIDAD_SUGERIDA[nuevoTipo] || disponiblesNuevoTipo[0]);
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
          {unidadesDisponibles.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
        <p className="text-xs text-brand-400 mt-1">
          {tipo === "Empaque" || tipo === "Etiqueta"
            ? "Sugerido \"pz\" porque este tipo casi siempre se cuenta por pieza."
            : "Las fórmulas están en kilos: usa kg o g. Solo usa \"pz\" si este insumo se cuenta por pieza y no por peso."}
        </p>
      </div>
    </>
  );
}
