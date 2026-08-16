"use client";

import { useState } from "react";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";

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
  children,
}: {
  nombre: string;
  usuario: string;
  roles: string[];
  sucursales: Sucursal[];
  sucursalActualId: string | null;
  children: React.ReactNode;
}) {
  const [menuAbierto, setMenuAbierto] = useState(false);

  return (
    <div className="flex min-h-screen">
      <Sidebar nombre={nombre} open={menuAbierto} onClose={() => setMenuAbierto(false)} />

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
        />
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full min-w-0">{children}</main>
      </div>
    </div>
  );
}
