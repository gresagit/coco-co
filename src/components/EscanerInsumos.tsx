"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEscanerCamara } from "@/lib/useEscanerCamara";

type InsumoEncontrado = {
  id: string;
  codigo_interno: string;
  nombre: string;
  marca?: string | null;
  tipo: string;
  unidad_medida: string;
};

type Stock = { cantidad_disponible: number; stock_minimo: number } | null;

export default function EscanerInsumos() {
  const router = useRouter();
  const [inputValue, setInputValue] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [mensajeError, setMensajeError] = useState<string | null>(null);
  const [encontrado, setEncontrado] = useState<InsumoEncontrado | null>(null);
  const [stock, setStock] = useState<Stock>(null);
  const [cantidadDerrame, setCantidadDerrame] = useState("");
  const [motivoDerrame, setMotivoDerrame] = useState("Derrame");
  const [registrando, setRegistrando] = useState(false);
  const [avisoDerrame, setAvisoDerrame] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function avisarResultado(ok: boolean) {
    try {
      if (!audioCtxRef.current) {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) audioCtxRef.current = new AudioCtx();
      }
      const ctx = audioCtxRef.current;
      if (ctx) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = ok ? 880 : 220;
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (ok ? 0.15 : 0.35));
        osc.start();
        osc.stop(ctx.currentTime + (ok ? 0.15 : 0.35));
      }
    } catch {
      // Autoplay bloqueado por el navegador: sin sonido, sin problema.
    }
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(ok ? 80 : [80, 60, 80]);
    }
  }

  async function buscarCodigo(codigo: string) {
    const limpio = codigo.trim();
    if (!limpio || buscando) return;
    setBuscando(true);
    setMensajeError(null);
    setAvisoDerrame(null);
    try {
      const res = await fetch(`/api/insumos/buscar?codigo=${encodeURIComponent(limpio)}`);
      const data = await res.json();
      if (data.ok) {
        setEncontrado(data.insumo);
        setStock(data.stock);
        setCantidadDerrame("");
        avisarResultado(true);
      } else {
        setEncontrado(null);
        setStock(null);
        setMensajeError(data.mensaje || "No se encontró ningún insumo con ese código.");
        avisarResultado(false);
      }
    } catch {
      setEncontrado(null);
      setStock(null);
      setMensajeError("No se pudo conectar con el servidor.");
      avisarResultado(false);
    } finally {
      setBuscando(false);
      setInputValue("");
      inputRef.current?.focus();
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      buscarCodigo(inputValue);
    }
  }

  const { camaraActiva, errorCamara, buscandoEnCuadro, videoRef, toggleCamara } = useEscanerCamara(buscarCodigo);

  async function registrarDerrame() {
    if (!encontrado) return;
    const cantidad = Number(cantidadDerrame);
    if (!cantidad || cantidad <= 0) return;
    setRegistrando(true);
    setAvisoDerrame(null);
    try {
      const res = await fetch(`/api/insumos/${encontrado.id}/derrame`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cantidad, motivo: motivoDerrame }),
      });
      const data = await res.json();
      if (data.ok) {
        setAvisoDerrame(data.mensaje);
        setStock((prev) => (prev ? { ...prev, cantidad_disponible: data.nuevaCantidad } : prev));
        setCantidadDerrame("");
        avisarResultado(true);
        router.refresh();
      } else {
        setAvisoDerrame(data.mensaje || "No se pudo registrar el derrame.");
        avisarResultado(false);
      }
    } catch {
      setAvisoDerrame("No se pudo conectar con el servidor.");
      avisarResultado(false);
    } finally {
      setRegistrando(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex-1 min-w-[240px]">
            <label className="label">Escanea o escribe el código del insumo</label>
            <input
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={onKeyDown}
              onBlur={() => !camaraActiva && setTimeout(() => inputRef.current?.focus(), 50)}
              placeholder="Apunta el lector Bluetooth aquí y dispara, o escribe y da Enter"
              className="input"
              autoComplete="off"
            />
          </div>
          <button type="button" onClick={toggleCamara} className={camaraActiva ? "btn-secondary" : "btn-primary"}>
            {camaraActiva ? "Apagar cámara" : "Usar cámara del teléfono"}
          </button>
        </div>
        {buscando && (
          <p className="text-xs text-brand-500 mt-2 flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-brand-400 animate-pulse" /> Buscando insumo…
          </p>
        )}
        {errorCamara && <p className="text-sm text-red-700 mt-2">{errorCamara}</p>}
        {camaraActiva && (
          <div className="mt-4 max-w-sm relative overflow-hidden rounded-lg">
            <video ref={videoRef} className="w-full rounded-lg border border-brand-150" muted playsInline />
            {buscandoEnCuadro && !buscando && <div className="escaner-linea" />}
            <div
              className={`pointer-events-none absolute inset-0 rounded-lg border-4 transition-colors duration-300 ${
                encontrado ? "border-green-500" : mensajeError ? "border-red-500" : "border-transparent"
              }`}
            />
            <p className="text-xs text-brand-400 mt-1">Apunta la cámara directo al código de barras del insumo.</p>
          </div>
        )}
      </div>

      {/* Aviso grande: no encontrado */}
      {mensajeError && !encontrado && (
        <div role="status" aria-live="assertive" className="card !py-4 flex items-center gap-3 border-2 border-red-600 bg-red-50">
          <span className="shrink-0 w-9 h-9 rounded-full bg-red-600 text-white text-lg font-bold flex items-center justify-center">✕</span>
          <div>
            <p className="font-semibold text-red-800">No se encontró el insumo</p>
            <p className="text-sm text-ink">{mensajeError}</p>
          </div>
        </div>
      )}

      {/* Ficha rápida del insumo encontrado, con acciones directas */}
      {encontrado && (
        <div role="status" aria-live="assertive" className="card !py-5 border-2 border-green-600 bg-green-50/40 space-y-4">
          <div className="flex items-start gap-3">
            <span className="shrink-0 w-9 h-9 rounded-full bg-green-600 text-white text-lg font-bold flex items-center justify-center">✓</span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-green-800">¡Insumo encontrado!</p>
              <h2 className="font-serif text-lg text-ink truncate">{encontrado.nombre}</h2>
              <p className="text-sm text-brand-500">
                <span className="font-mono text-xs">{encontrado.codigo_interno}</span>
                {encontrado.marca && ` · ${encontrado.marca}`} · {encontrado.tipo}
              </p>
              {stock ? (
                <p className="text-sm text-ink mt-1">
                  Disponible: <span className="font-medium">{stock.cantidad_disponible} {encontrado.unidad_medida}</span>
                  {" · "}mínimo {stock.stock_minimo} {encontrado.unidad_medida}
                </p>
              ) : (
                <p className="text-xs text-brand-400 mt-1">Sin stock registrado en esta tienda todavía.</p>
              )}
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4 pt-3 border-t border-green-700/20">
            {/* Acción rápida: derrame / salida sin entrar a la ficha */}
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-brand-400">
                Registrar derrame o salida rápida
              </p>
              <div className="flex flex-wrap gap-2">
                <input
                  type="number"
                  step="0.01"
                  min={0.01}
                  placeholder={`Cantidad (${encontrado.unidad_medida})`}
                  value={cantidadDerrame}
                  onChange={(e) => setCantidadDerrame(e.target.value)}
                  className="input !w-40"
                />
                <select value={motivoDerrame} onChange={(e) => setMotivoDerrame(e.target.value)} className="input !w-40">
                  <option>Derrame</option>
                  <option>Merma</option>
                  <option>Dañado</option>
                  <option>Uso no planeado</option>
                </select>
                <button
                  type="button"
                  onClick={registrarDerrame}
                  disabled={registrando || !cantidadDerrame}
                  className="btn-accent text-sm disabled:opacity-50"
                >
                  {registrando ? "Registrando…" : "Registrar"}
                </button>
              </div>
              {avisoDerrame && <p className="text-xs text-ink">{avisoDerrame}</p>}
            </div>

            {/* Ir a la ficha completa para editar cualquier dato */}
            <div className="space-y-2 sm:border-l sm:border-green-700/20 sm:pl-4">
              <p className="text-xs font-medium uppercase tracking-wide text-brand-400">
                ¿Necesitas cambiar algo más?
              </p>
              <p className="text-sm text-brand-500">
                Nombre, marca, tipo, unidad, costo, stock mínimo o cargar más cantidad.
              </p>
              <Link href={`/dashboard/insumos/${encontrado.id}/stock`} className="btn-secondary text-sm inline-block">
                Abrir ficha completa →
              </Link>
            </div>
          </div>
        </div>
      )}

      <Link href="/dashboard/insumos" className="text-sm text-brand-600 underline">
        ← Volver al catálogo de insumos
      </Link>
    </div>
  );
}
