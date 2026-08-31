"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { dispararBurbujas } from "@/lib/burbujas";
import ThemeToggle from "@/components/ThemeToggle";
import type { Permisos } from "@/lib/roles";

type Sucursal = { id: string; nombre: string };

export default function TopBar({
  nombre,
  usuario,
  roles,
  sucursales,
  sucursalActualId,
  onMenuClick,
  permisos,
}: {
  nombre: string;
  usuario: string;
  roles: string[];
  sucursales: Sucursal[];
  sucursalActualId: string | null;
  onMenuClick?: () => void;
  permisos: Permisos;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [cambiando, setCambiando] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [mostrarResultados, setMostrarResultados] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [confirmarDestino, setConfirmarDestino] = useState<{ label: string; path: string } | null>(null);
  const [resultadosBusqueda, setResultadosBusqueda] = useState<Array<{ label: string; type: string; path: string; metadata?: string }>>([]);
  const sucursalDetailsRef = useRef<HTMLDetailsElement>(null);
  const perfilDetailsRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const pregunta = busqueda.trim();
    if (pregunta.length < 2) {
      setResultadosBusqueda([]);
      setIsSearching(false);
      return;
    }

    let activo = true;
    const timeout = window.setTimeout(async () => {
      try {
        setIsSearching(true);
        const controller = new AbortController();
        const res = await fetch(`/api/busqueda-global?q=${encodeURIComponent(pregunta)}`, { signal: controller.signal });
        if (!res.ok) return;
        const data = await res.json();
        if (activo) setResultadosBusqueda(data.results || []);
      } catch {
        if (activo) setResultadosBusqueda([]);
      } finally {
        if (activo) setIsSearching(false);
      }
    }, 250);

    return () => {
      activo = false;
      window.clearTimeout(timeout);
    };
  }, [busqueda]);

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

  function volver() {
    const origenInterno = document.referrer.startsWith(window.location.origin);
    if (origenInterno && window.history.length > 1) {
      router.back();
      return;
    }
    router.push("/dashboard");
  }

  function abrirResultado(ruta: string, label?: string) {
    setConfirmarDestino(label ? { label, path: ruta } : null);
  }

  function confirmarNavegacion() {
    if (!confirmarDestino) return;
    const { path } = confirmarDestino;
    setBusqueda("");
    setMostrarResultados(false);
    setConfirmarDestino(null);
    router.push(path);
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
      {pathname !== "/dashboard" && (
        <button
          type="button"
          onClick={volver}
          aria-label="Regresar a la página anterior"
          title="Regresar"
          className="text-ink p-1.5 rounded-lg hover:bg-brand-100 transition-colors"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M19 12H5M11 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
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

      <div className="relative hidden md:block w-full max-w-xs">
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-brand-400">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
            <circle cx="11" cy="11" r="5.5" strokeLinecap="round" />
            <path d="m16 16 4 4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <input
          type="search"
          value={busqueda}
          onChange={(event) => {
            setBusqueda(event.target.value);
            setMostrarResultados(true);
          }}
          onFocus={() => setMostrarResultados(true)}
          onBlur={() => {
            window.setTimeout(() => setMostrarResultados(false), 120);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && resultadosBusqueda[0]) {
              event.preventDefault();
              abrirResultado(resultadosBusqueda[0].path, resultadosBusqueda[0].label);
            }
          }}
          placeholder="Buscar productos, insumos, clientes, reportes..."
          aria-label="Buscar cualquier dato o sección del sistema"
          className="w-full rounded-lg border border-brand-200 bg-surface py-1.5 pl-9 pr-3 text-sm text-ink placeholder:text-brand-400 focus:border-brand-400 focus:outline-none"
        />

        {isSearching && busqueda.trim().length >= 2 && (
          <div className="absolute left-0 right-0 top-full mt-2 rounded-lg border border-brand-150 bg-surface px-3 py-2 text-xs text-brand-500 shadow-soft z-30">
            Buscando resultados...
          </div>
        )}

        {mostrarResultados && busqueda.trim() && resultadosBusqueda.length > 0 && (
          <div className="absolute left-0 right-0 top-full mt-2 rounded-lg border border-brand-150 bg-surface shadow-soft z-30 overflow-hidden">
            {resultadosBusqueda.map((opcion) => (
              <button
                key={`${opcion.path}-${opcion.label}-${opcion.type}`}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => abrirResultado(opcion.path, opcion.label)}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm text-brand-600 hover:bg-brand-50 transition-colors"
              >
                <span className="min-w-0">
                  <span className="block truncate">{opcion.label}</span>
                  {opcion.metadata && <span className="block text-[10px] text-brand-400 uppercase tracking-[0.08em]">{opcion.metadata}</span>}
                </span>
                <span className="text-[10px] uppercase tracking-[0.12em] text-brand-400">{opcion.type}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {confirmarDestino && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/35 p-4">
          <div className="w-full max-w-sm rounded-xl border border-brand-150 bg-surface p-4 shadow-soft">
            <p className="text-sm text-brand-500">¿Quieres abrir esta sección?</p>
            <p className="mt-2 text-lg font-semibold text-ink">{confirmarDestino.label}</p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setConfirmarDestino(null)} className="btn-secondary">Cancelar</button>
              <button type="button" onClick={confirmarNavegacion} className="btn-primary">Ir</button>
            </div>
          </div>
        </div>
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
            hidden={!roles.includes("Administrador") && !permisos.usuarios?.includes("ver")}
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
