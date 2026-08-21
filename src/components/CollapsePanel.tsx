"use client";

import { useState, type ReactNode } from "react";

/**
 * Panel plegable estilo acordeón. Se usa para meter el lector de códigos de
 * barra directo en la página del catálogo (producto terminado / insumos) sin
 * amontonar todo a la vista: arranca cerrado, y al abrirse empuja el resto
 * del contenido hacia abajo (nunca se encima nada) con un desplazamiento
 * suave en vez de aparecer/desaparecer de golpe.
 *
 * El contenido solo se monta cuando el panel está abierto — así la cámara
 * no se prende ni el input le roba el foco a otros campos de la página
 * mientras el panel sigue cerrado.
 */
export default function CollapsePanel({
  title,
  description,
  icon,
  defaultOpen = false,
  children,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="card !p-0 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left hover:bg-brand-50/60 transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          {icon && (
            <span
              className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center border transition-colors ${
                open ? "bg-ink text-cream border-ink" : "bg-brand-50 text-brand-500 border-brand-150"
              }`}
            >
              {icon}
            </span>
          )}
          <div className="min-w-0">
            <h2 className="font-semibold text-ink">{title}</h2>
            {description && <p className="text-sm text-brand-500 mt-0.5">{description}</p>}
          </div>
        </div>
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          className={`shrink-0 text-brand-400 transition-transform duration-300 ease-out ${open ? "rotate-180" : ""}`}
        >
          <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <div
        className="grid transition-[grid-template-rows] duration-300 ease-out"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          {open && (
            <div className="border-t border-brand-150 px-5 py-5 animate-fade-in-up">{children}</div>
          )}
        </div>
      </div>
    </div>
  );
}
