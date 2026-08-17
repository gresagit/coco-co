"use client";

import { useEffect, useRef, useState } from "react";
import type { IScannerControls } from "@zxing/browser";

/**
 * Hook compartido para leer códigos de barra con la cámara del navegador.
 *
 * Antes, cada componente (EscanerInsumos / EscanerInventario) creaba su
 * propio BrowserMultiFormatReader "a mano" con un setTimeout(50ms) para
 * esperar a que el <video> existiera, y al "apagar" la cámara solo se hacía
 * `readerRef.current = null` — eso NUNCA detenía el stream de la cámara ni
 * el ciclo de escaneo interno de zxing. Resultado: el stream anterior se
 * quedaba vivo, y al volver a encender la cámara, el navegador terminaba
 * confundido entre streams (sobre todo en celulares) — la cámara se veía
 * "prendida" pero nunca detectaba nada.
 *
 * Aquí guardamos el `IScannerControls` que regresa zxing y llamamos a
 * `controls.stop()` de verdad (apaga el track de la cámara) cada vez que se
 * apaga o se desmonta el componente.
 */
export function useEscanerCamara(onCodigo: (texto: string) => void, cooldownMs = 2500) {
  const [camaraActiva, setCamaraActiva] = useState(false);
  const [errorCamara, setErrorCamara] = useState<string | null>(null);
  const [buscandoEnCuadro, setBuscandoEnCuadro] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const ultimoDecodificado = useRef<{ codigo: string; hora: number }>({ codigo: "", hora: 0 });
  const onCodigoRef = useRef(onCodigo);
  onCodigoRef.current = onCodigo;

  useEffect(() => {
    if (!camaraActiva) return;
    let cancelado = false;

    (async () => {
      try {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const { DecodeHintType, BarcodeFormat } = await import("@zxing/library");

        // TRY_HARDER + limitar a los formatos que de verdad usamos (Code128
        // para folios/SKU propios, más los formatos de barras comerciales
        // más comunes por si se escanea un producto ya empacado) hace que
        // decodifique más rápido y con menos fallos que buscar los ~12
        // formatos que soporta la librería por default (incluye QR, Aztec,
        // PDF417, etc. que aquí nunca se usan).
        const hints = new Map();
        hints.set(DecodeHintType.TRY_HARDER, true);
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.CODE_128,
          BarcodeFormat.CODE_39,
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.UPC_A,
          BarcodeFormat.UPC_E,
        ]);

        const reader = new BrowserMultiFormatReader(hints);
        if (cancelado || !videoRef.current) return;

        const controls = await reader.decodeFromVideoDevice(undefined, videoRef.current, (result) => {
          setBuscandoEnCuadro(false);
          if (!result) return;
          const texto = result.getText();
          const ahora = Date.now();
          // Evita procesar el mismo código varias veces mientras sigue frente a la cámara.
          if (texto === ultimoDecodificado.current.codigo && ahora - ultimoDecodificado.current.hora < cooldownMs) {
            return;
          }
          ultimoDecodificado.current = { codigo: texto, hora: ahora };
          onCodigoRef.current(texto);
        });

        if (cancelado) {
          controls.stop();
          return;
        }
        controlsRef.current = controls;
        setBuscandoEnCuadro(true);
      } catch (err: any) {
        if (!cancelado) {
          setErrorCamara(
            err?.name === "NotAllowedError"
              ? "El navegador no tiene permiso de usar la cámara. Revisa los permisos del sitio."
              : err?.message || "No se pudo acceder a la cámara."
          );
          setCamaraActiva(false);
        }
      }
    })();

    return () => {
      cancelado = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
      setBuscandoEnCuadro(false);
    };
  }, [camaraActiva, cooldownMs]);

  function toggleCamara() {
    setErrorCamara(null);
    setCamaraActiva((v) => !v);
  }

  return { camaraActiva, errorCamara, buscandoEnCuadro, videoRef, toggleCamara };
}
