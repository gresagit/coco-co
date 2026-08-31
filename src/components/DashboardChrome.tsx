"use client";

import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";
import type { Permisos } from "@/lib/roles";

type Sucursal = { id: string; nombre: string };

// Envuelve el Sidebar y el TopBar para que compartan el estado de "menú
// abierto/cerrado" en pantallas chicas (celular/tablet). Antes el Sidebar
// era un panel fijo de 256px que nunca se ocultaba, así que en pantallas
// angostas se comía casi toda la pantalla y dejaba el contenido apachurrado.
export default function DashboardChrome({
  nombre,
  usuario,
  roles,
  sucursales,
  sucursalActualId,
  permisos,
  children,
}: {
  nombre: string;
  usuario: string;
  roles: string[];
  sucursales: Sucursal[];
  sucursalActualId: string | null;
  permisos: Permisos;
  children: React.ReactNode;
}) {
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [accionPendiente, setAccionPendiente] = useState<{ label: string } | null>(null);

  useEffect(() => {
    const manejarClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const elemento = target?.closest("button, a, input[type='submit'], summary") as HTMLElement | null;
      if (!elemento || elemento.closest("[data-action-skip]")) {
        return;
      }

      const texto = elemento.getAttribute("aria-label") || elemento.textContent?.trim() || "Acción";
      setAccionPendiente({ label: texto || "Procesando" });

      window.setTimeout(() => {
        setAccionPendiente(null);
      }, 900);
    };

    document.addEventListener("click", manejarClick, true);
    return () => document.removeEventListener("click", manejarClick, true);
  }, []);

  return (
    <div className="flex min-h-screen">
      <Sidebar nombre={nombre} roles={roles} permisos={permisos} open={menuAbierto} onClose={() => setMenuAbierto(false)} />

      {/* Fondo oscuro detrás del menú cuando está abierto en móvil */}
      {menuAbierto && (
        <div
          className="fixed inset-0 bg-ink/40 z-40 lg:hidden"
          onClick={() => setMenuAbierto(false)}
          aria-hidden="true"
        />
      )}

      <div className="flex-1 flex flex-col min-h-screen w-full min-w-0">
        <TopBar
          nombre={nombre}
          usuario={usuario}
          roles={roles}
          sucursales={sucursales}
          sucursalActualId={sucursalActualId}
          onMenuClick={() => setMenuAbierto(true)}
          permisos={permisos}
        />
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full min-w-0">{children}</main>
      </div>

      {accionPendiente && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/25 backdrop-blur-[1px]">
          <div className="flex items-center gap-3 rounded-2xl border border-green-300 bg-surface px-4 py-3 shadow-soft animate-fade-in-up">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-green-600/10 text-green-600">
              <span className="loader-green" aria-hidden="true" />
            </span>
            <div>
              <p className="text-[10px] uppercase tracking-[0.18em] text-brand-400">Procesando</p>
              <p className="text-sm font-medium text-ink">{accionPendiente.label}</p>
            </div>
            <span className="ml-1 text-green-600" aria-hidden="true">→</span>
          </div>
        </div>
      )}
    </div>
  );
}
