"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useEscanerCamara } from "@/lib/useEscanerCamara";

type Registro = {
  folio: string;
  ok: boolean;
  mensaje: string;
  hora: string;
};

export default function EscanerInventario() {
  const [inputValue, setInputValue] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [tally, setTally] = useState<Record<string, number>>({});

  const [ultimoResultado, setUltimoResultado] = useState<Registro | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const bannerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // El input siempre debe tener el foco: así un escáner Bluetooth (que actúa
  // como teclado) puede "escribir" y mandar Enter sin que el usuario haga nada.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    return () => {
      if (bannerTimeoutRef.current) clearTimeout(bannerTimeoutRef.current);
    };
  }, []);

  // Retroalimentación clara e inmediata de que "sí pasó algo": beep + vibración
  // + un aviso grande en pantalla (no solo una línea chiquita en la lista de
  // abajo, que fácilmente se pierde de vista, sobre todo usando la cámara).
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
      // Si el navegador bloquea el audio (autoplay), simplemente no suena.
    }
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(ok ? 80 : [80, 60, 80]);
    }
  }

  async function procesarFolio(folio: string) {
    const limpio = folio.trim();
    if (!limpio || enviando) return;
    setEnviando(true);
    try {
      const res = await fetch("/api/escaneo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folio: limpio }),
      });
      const data = await res.json();
      const registro: Registro = {
        folio: limpio,
        ok: !!data.ok,
        mensaje: data.ok ? `${data.productoNombre}` : data.mensaje,
        hora: new Date().toLocaleTimeString(),
      };
      setRegistros((prev) => [registro, ...prev].slice(0, 30));
      setUltimoResultado(registro);
      avisarResultado(registro.ok);
      if (bannerTimeoutRef.current) clearTimeout(bannerTimeoutRef.current);
      bannerTimeoutRef.current = setTimeout(() => setUltimoResultado(null), 4000);
      if (data.ok) {
        setTally((prev) => ({ ...prev, [data.productoNombre]: (prev[data.productoNombre] || 0) + 1 }));
      }
    } catch {
      const registro: Registro = {
        folio: limpio,
        ok: false,
        mensaje: "No se pudo conectar con el servidor.",
        hora: new Date().toLocaleTimeString(),
      };
      setRegistros((prev) => [registro, ...prev].slice(0, 30));
      setUltimoResultado(registro);
      avisarResultado(false);
      if (bannerTimeoutRef.current) clearTimeout(bannerTimeoutRef.current);
      bannerTimeoutRef.current = setTimeout(() => setUltimoResultado(null), 4000);
    } finally {
      setEnviando(false);
      setInputValue("");
      inputRef.current?.focus();
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      procesarFolio(inputValue);
    }
  }

  const { camaraActiva, errorCamara, buscandoEnCuadro, videoRef, toggleCamara } = useEscanerCamara(procesarFolio);

  const totalSesion = Object.values(tally).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-4">
      {/* Aviso grande e imposible de perder: confirma de inmediato si el
          escaneo funcionó o no (antes solo aparecía chiquito hasta abajo). */}
      {ultimoResultado && (
        <div
          role="status"
          aria-live="assertive"
          className={`card !py-4 flex items-center gap-3 border-2 transition-colors ${
            ultimoResultado.ok ? "border-green-600 bg-green-50" : "border-red-600 bg-red-50"
          }`}
        >
          <span
            className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-white text-lg font-bold ${
              ultimoResultado.ok ? "bg-green-600" : "bg-red-600"
            }`}
          >
            {ultimoResultado.ok ? "✓" : "✕"}
          </span>
          <div className="min-w-0">
            <p className={`font-semibold ${ultimoResultado.ok ? "text-green-800" : "text-red-800"}`}>
              {ultimoResultado.ok ? "¡Escaneado correctamente!" : "No se pudo escanear"}
            </p>
            <p className="text-sm text-ink truncate">
              <span className="font-mono text-xs text-brand-500">{ultimoResultado.folio}</span> — {ultimoResultado.mensaje}
            </p>
          </div>
        </div>
      )}

      <div className="card">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex-1 min-w-[240px]">
            <label className="label">Escanea o escribe el folio</label>
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
        {enviando && (
          <p className="text-xs text-brand-500 mt-2 flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-brand-400 animate-pulse" /> Procesando escaneo…
          </p>
        )}
        {errorCamara && <p className="text-sm text-red-700 mt-2">{errorCamara}</p>}
        {camaraActiva && (
          <div className="mt-4 max-w-sm relative overflow-hidden rounded-lg">
            <video ref={videoRef} className="w-full rounded-lg border border-brand-150" muted playsInline />
            {buscandoEnCuadro && !enviando && <div className="escaner-linea" />}
            {/* Marco guía + destello de color al detectar un código, para que
                se note al instante incluso mirando la pantalla del celular. */}
            <div
              className={`pointer-events-none absolute inset-0 rounded-lg border-4 transition-colors duration-300 ${
                ultimoResultado ? (ultimoResultado.ok ? "border-green-500" : "border-red-500") : "border-transparent"
              }`}
            />
            <p className="text-xs text-brand-400 mt-1">Apunta la cámara directo al código de barras.</p>
          </div>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="card">
          <h2 className="font-semibold mb-3">Esta sesión: {totalSesion} piezas</h2>
          {Object.keys(tally).length === 0 ? (
            <p className="text-sm text-brand-400">Aún no escaneas nada.</p>
          ) : (
            <ul className="space-y-1.5">
              {Object.entries(tally).map(([nombre, cantidad]) => (
                <li key={nombre} className="flex items-center justify-between text-sm">
                  <span className="text-ink">{nombre}</span>
                  <span className="font-medium text-ink">{cantidad}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card">
          <h2 className="font-semibold mb-3">Últimos escaneos</h2>
          {registros.length === 0 ? (
            <p className="text-sm text-brand-400">Aquí verás el resultado de cada escaneo.</p>
          ) : (
            <ul className="space-y-1.5 max-h-72 overflow-y-auto">
              {registros.map((r, i) => (
                <li key={i} className="flex items-center justify-between text-sm gap-2">
                  <span className="font-mono text-xs text-brand-400 shrink-0">{r.hora}</span>
                  <span className="font-mono text-xs text-brand-500 truncate">{r.folio}</span>
                  <span className={`text-xs shrink-0 ${r.ok ? "text-green-700" : "text-red-700"}`}>{r.mensaje}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <Link href="/dashboard/productos" className="text-sm text-brand-600 underline">
        ← Volver al inventario de productos
      </Link>
    </div>
  );
}
