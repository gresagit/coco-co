"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { BrowserMultiFormatReader as BrowserMultiFormatReaderType } from "@zxing/browser";

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
  const [camaraActiva, setCamaraActiva] = useState(false);
  const [errorCamara, setErrorCamara] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<BrowserMultiFormatReaderType | null>(null);
  const ultimoDecodificado = useRef<{ folio: string; hora: number }>({ folio: "", hora: 0 });

  // El input siempre debe tener el foco: así un escáner Bluetooth (que actúa
  // como teclado) puede "escribir" y mandar Enter sin que el usuario haga nada.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

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
      setRegistros((prev) => [
        { folio: limpio, ok: !!data.ok, mensaje: data.ok ? `${data.productoNombre}` : data.mensaje, hora: new Date().toLocaleTimeString() },
        ...prev,
      ].slice(0, 30));
      if (data.ok) {
        setTally((prev) => ({ ...prev, [data.productoNombre]: (prev[data.productoNombre] || 0) + 1 }));
      }
    } catch {
      setRegistros((prev) => [
        { folio: limpio, ok: false, mensaje: "No se pudo conectar con el servidor.", hora: new Date().toLocaleTimeString() },
        ...prev,
      ].slice(0, 30));
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

  async function toggleCamara() {
    if (camaraActiva) {
      readerRef.current = null;
      setCamaraActiva(false);
      return;
    }
    setErrorCamara(null);
    try {
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      const reader = new BrowserMultiFormatReader();
      readerRef.current = reader;
      setCamaraActiva(true);
      // Se activa en el próximo render, cuando el <video> ya existe en el DOM.
      setTimeout(async () => {
        if (!videoRef.current) return;
        try {
          await reader.decodeFromVideoDevice(undefined, videoRef.current, (result) => {
            if (!result) return;
            const texto = result.getText();
            const ahora = Date.now();
            // Evita procesar el mismo código varias veces mientras sigue frente a la cámara.
            if (texto === ultimoDecodificado.current.folio && ahora - ultimoDecodificado.current.hora < 2500) {
              return;
            }
            ultimoDecodificado.current = { folio: texto, hora: ahora };
            procesarFolio(texto);
          });
        } catch (err: any) {
          setErrorCamara(err?.message || "No se pudo acceder a la cámara.");
          setCamaraActiva(false);
        }
      }, 50);
    } catch (err: any) {
      setErrorCamara("No se pudo cargar el lector de cámara.");
      setCamaraActiva(false);
    }
  }

  useEffect(() => {
    return () => {
      readerRef.current = null;
    };
  }, []);

  const totalSesion = Object.values(tally).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-4">
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
        {errorCamara && <p className="text-sm text-red-700 mt-2">{errorCamara}</p>}
        {camaraActiva && (
          <div className="mt-4 max-w-sm">
            <video ref={videoRef} className="w-full rounded-sm border border-brand-150" muted playsInline />
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
