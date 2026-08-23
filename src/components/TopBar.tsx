"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { dispararBurbujas } from "@/lib/burbujas";
import ThemeToggle from "@/components/ThemeToggle";

type Sucursal = { id: string; nombre: string };

export default function TopBar({
  nombre,
  usuario,
  roles,
  sucursales,
  sucursalActualId,
  onMenuClick,
}: {
  nombre: string;
  usuario: string;
  roles: string[];
  sucursales: Sucursal[];
  sucursalActualId: string | null;
  onMenuClick?: () => void;
}) {
  const router = useRouter();
  const [cambiando, setCambiando] = useState(false);
  const sucursalDetailsRef = useRef<HTMLDetailsElement>(null);
  const perfilDetailsRef = useRef<HTMLDetailsElement>(null);

  const sucursalActual = sucursales.find((s) => s.id === sucursalActualId) || sucursales[0];
  const iniciales = nombre
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

  async function elegirSucursal(id: string) {
    setCambiando(true);
    await fetch("/api/sucursal-actual", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sucursalId: id }),
    });
    sucursalDetailsRef.current?.removeAttribute("open");
    setCambiando(false);
    router.refresh();
  }

  async function onLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  // Cada click sobre un botón/enlace/selector de la barra de herramientas
  // avienta unas burbujitas de jabón desde donde se hizo click — puro efecto
  // visual, no cambia ninguna lógica de los controles.
  function onClickToolbar(e: React.MouseEvent<HTMLElement>) {
    const target = (e.target as HTMLElement).closest("button, summary, a");
    if (!target) return;
    dispararBurbujas(e.clientX, e.clientY);
  }

  return (
    <header
      onClickCapture={onClickToolbar}
      className="h-16 border-b border-brand-150 bg-cream/95 backdrop-blur-sm sticky top-0 z-20 flex items-center justify-between gap-3 px-4 sm:px-6"
    >
      {/* Botón de menú — solo visible en pantallas chicas, abre el sidebar */}
      <button
        type="button"
        onClick={onMenuClick}
        aria-label="Abrir menú"
        className="lg:hidden text-ink p-1.5 -ml-1.5 rounded-lg hover:bg-brand-100 transition-colors"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M3.5 6.5h17M3.5 12h17M3.5 17.5h17" strokeLinecap="round" />
        </svg>
      </button>
      <div className="flex items-center justify-end gap-3 flex-1 min-w-0">
      {/* Selector de tienda / sucursal */}
      {sucursales.length > 0 && (
        <details ref={sucursalDetailsRef} className="relative">
          <summary className="list-none cursor-pointer select-none flex items-center gap-2 rounded-lg border border-brand-200 bg-surface px-2.5 sm:px-3 py-1.5 text-sm hover:border-brand-400 transition-colors">
            <IconStore />
            <span className="text-brand-500 hidden sm:inline">Tienda:</span>
            <span className="font-medium text-ink">{sucursalActual?.nombre || "—"}</span>
            <IconChevron />
          </summary>
          <div className="absolute right-0 mt-2 w-56 bg-surface border border-brand-150 rounded-lg shadow-soft py-1 z-30 animate-fade-in-up">
            {sucursales.map((s) => (
              <button
                key={s.id}
                type="button"
                disabled={cambiando}
                onClick={() => elegirSucursal(s.id)}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-brand-50 transition-colors ${
                  s.id === sucursalActual?.id ? "text-ink font-medium" : "text-brand-500"
                }`}
              >
                {s.nombre}
              </button>
            ))}
          </div>
        </details>
      )}

      {/* Modo claro / oscuro */}
      <ThemeToggle />

      {/* Selector de perfil / usuario */}
      <details ref={perfilDetailsRef} className="relative">
        <summary className="list-none cursor-pointer select-none flex items-center gap-2 rounded-lg border border-brand-200 bg-surface pl-1.5 pr-2.5 sm:pr-3 py-1.5 hover:border-brand-400 transition-colors">
          <span className="w-7 h-7 rounded-full bg-ink text-cream text-xs font-medium flex items-center justify-center">
            {iniciales || "?"}
          </span>
          <span className="text-sm font-medium text-ink hidden sm:inline">{nombre}</span>
          <IconChevron />
        </summary>
        <div className="absolute right-0 mt-2 w-60 bg-surface border border-brand-150 rounded-lg shadow-soft py-1 z-30 animate-fade-in-up">
          <div className="px-3 py-2 border-b border-brand-100">
            <p className="text-sm font-medium text-ink">{nombre}</p>
            <p className="text-xs text-brand-400">@{usuario}</p>
            {roles.length > 0 && (
              <p className="text-xs text-brand-400 mt-0.5">{roles.join(" · ")}</p>
            )}
          </div>
          <a
            href="/dashboard/usuarios"
            className="block px-3 py-2 text-sm text-brand-600 hover:bg-brand-50 transition-colors"
          >
            Usuarios y roles
          </a>
          {roles.includes("Administrador") && (
            <a
              href="/dashboard/auditoria"
              className="block px-3 py-2 text-sm text-brand-600 hover:bg-brand-50 transition-colors"
            >
              Auditoría
            </a>
          )}
          <button
            onClick={onLogout}
            className="block w-full text-left px-3 py-2 text-sm text-red-700 hover:bg-brand-50 transition-colors"
          >
            Cerrar sesión
          </button>
        </div>
      </details>
      </div>
    </header>
  );
}

function IconStore() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="text-brand-400">
      <path d="M4 9.5 5.2 4h13.6l1.2 5.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 9.5a2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 9.5V20h14V9.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9.5 20v-6h5v6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconChevron() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-brand-400">
      <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
