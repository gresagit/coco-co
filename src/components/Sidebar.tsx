"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const NAV = [
  { href: "/dashboard", label: "Inicio", icon: "🏠" },
  { href: "/dashboard/productos", label: "Producto Terminado", icon: "🧴" },
  { href: "/dashboard/insumos", label: "Insumos", icon: "🧪" },
  { href: "/dashboard/bom", label: "Fórmulas (BOM)", icon: "🧮" },
  { href: "/dashboard/produccion", label: "Producción", icon: "🏭" },
  { href: "/dashboard/movimientos", label: "Movimientos", icon: "🔄" },
  { href: "/dashboard/proveedores", label: "Proveedores", icon: "🚚" },
  { href: "/dashboard/ordenes-compra", label: "Órdenes de Compra", icon: "📄" },
  { href: "/dashboard/sucursales", label: "Sucursales", icon: "🏬" },
  { href: "/dashboard/alertas", label: "Alertas", icon: "🚦" },
  { href: "/dashboard/usuarios", label: "Usuarios y Roles", icon: "👥" },
];

export default function Sidebar({ nombre }: { nombre: string }) {
  const pathname = usePathname();
  const router = useRouter();

  async function onLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="w-64 bg-brand-700 text-white flex flex-col min-h-screen">
      <div className="px-5 py-6 border-b border-brand-600">
        <h1 className="font-bold text-lg">Coco & Co.</h1>
        <p className="text-brand-100 text-xs">Sistema de Inventarios</p>
      </div>
      <nav className="flex-1 overflow-y-auto py-4">
        {NAV.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-5 py-2.5 text-sm ${
                active ? "bg-brand-600 font-medium" : "hover:bg-brand-600/60"
              }`}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="px-5 py-4 border-t border-brand-600 text-sm">
        <p className="text-brand-100 mb-2">Sesión: {nombre}</p>
        <button onClick={onLogout} className="btn-secondary w-full !bg-brand-600 !text-white !border-brand-500">
          Cerrar sesión
        </button>
      </div>
    </aside>
  );
}
