"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { SVGProps } from "react";

type NavItem = { href: string; label: string; icon: (props: SVGProps<SVGSVGElement>) => JSX.Element };
type NavGroup = { label: string; items: NavItem[] };

const GROUPS: NavGroup[] = [
  {
    label: "",
    items: [{ href: "/dashboard", label: "Inicio", icon: IconHome }],
  },
  {
    label: "Catálogo",
    items: [
      { href: "/dashboard/productos", label: "Producto terminado", icon: IconBottle },
      { href: "/dashboard/productos/escanear", label: "Escanear inventario", icon: IconScan },
      { href: "/dashboard/insumos", label: "Insumos", icon: IconLayers },
      { href: "/dashboard/bom", label: "Fórmulas (BOM)", icon: IconBeaker },
      { href: "/dashboard/codigos-barra", label: "Códigos de barra", icon: IconBarcode },
    ],
  },
  {
    label: "Operación",
    items: [
      { href: "/dashboard/produccion", label: "Producción", icon: IconFactory },
      { href: "/dashboard/movimientos", label: "Movimientos", icon: IconSwap },
      { href: "/dashboard/alertas", label: "Alertas", icon: IconBell },
    ],
  },
  {
    label: "Compras",
    items: [
      { href: "/dashboard/proveedores", label: "Proveedores", icon: IconTruck },
      { href: "/dashboard/ordenes-compra", label: "Órdenes de compra", icon: IconDoc },
    ],
  },
  {
    label: "Administración",
    items: [
      { href: "/dashboard/metas", label: "Metas de producción", icon: IconTarget },
      { href: "/dashboard/sucursales", label: "Sucursales", icon: IconStore },
      { href: "/dashboard/usuarios", label: "Usuarios y roles", icon: IconUsers },
    ],
  },
];

export default function Sidebar({ nombre }: { nombre: string }) {
  const pathname = usePathname();

  return (
    <aside className="w-64 shrink-0 bg-white border-r border-brand-150 flex flex-col min-h-screen">
      <div className="px-6 py-6 border-b border-brand-150">
        <h1 className="font-serif text-lg text-ink leading-none">Coco & Co.</h1>
        <p className="text-brand-400 text-xs mt-1.5 uppercase tracking-widest2">Inventarios</p>
      </div>
      <nav className="flex-1 overflow-y-auto py-5">
        {GROUPS.map((group, gi) => (
          <div key={gi} className={gi === 0 ? "" : "mt-6"}>
            {group.label && (
              <p className="px-6 mb-1.5 text-[11px] font-medium uppercase tracking-widest2 text-brand-300">
                {group.label}
              </p>
            )}
            {group.items.map((item) => {
              const active = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 px-6 py-2 text-sm border-l-2 transition-colors ${
                    active
                      ? "border-ink text-ink font-medium bg-brand-50"
                      : "border-transparent text-brand-500 hover:text-ink hover:bg-brand-50/60"
                  }`}
                >
                  <Icon className="w-[17px] h-[17px] shrink-0" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="px-6 py-4 border-t border-brand-150">
        <p className="text-brand-300 text-xs">Sesión activa</p>
        <p className="text-sm text-ink truncate">{nombre}</p>
      </div>
    </aside>
  );
}

/* Iconos de línea minimalistas — sin emojis, trazo consistente. */

function base(props: SVGProps<SVGSVGElement>) {
  return { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.6, ...props };
}

function IconHome(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <path d="M4 11.5 12 4l8 7.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 10v9h12v-9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 19v-5h4v5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconBottle(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <path d="M10 3h4v3.2l1.6 2.4V20a1 1 0 0 1-1 1H9.4a1 1 0 0 1-1-1V8.6L10 6.2V3Z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 13h6" strokeLinecap="round" />
    </svg>
  );
}

function IconLayers(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <path d="m12 4 8 4.5-8 4.5-8-4.5L12 4Z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m4 13 8 4.5 8-4.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconBeaker(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <path d="M9 3h6" strokeLinecap="round" />
      <path d="M10 3v6.5L4.8 18a1.6 1.6 0 0 0 1.4 2.4h11.6a1.6 1.6 0 0 0 1.4-2.4L14 9.5V3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7.5 15h9" strokeLinecap="round" />
    </svg>
  );
}

function IconFactory(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <path d="M4 20V11l5 3.2V11l5 3.2V11l5 3.2V20H4Z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 20h16" strokeLinecap="round" />
    </svg>
  );
}

function IconSwap(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <path d="M4 8h13l-3-3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20 16H7l3 3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconBell(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <path d="M6 10a6 6 0 0 1 12 0v4l1.5 3h-15L6 14v-4Z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 20a2 2 0 0 0 4 0" strokeLinecap="round" />
    </svg>
  );
}

function IconTruck(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <path d="M3 7h11v9H3z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14 10h4l3 3v3h-7z" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="7" cy="18" r="1.6" />
      <circle cx="17.5" cy="18" r="1.6" />
    </svg>
  );
}

function IconDoc(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <path d="M7 3h7l4 4v14H7z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14 3v4h4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9.5 12.5h5M9.5 15.5h5" strokeLinecap="round" />
    </svg>
  );
}

function IconStore(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <path d="M4 9.5 5.2 4h13.6l1.2 5.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 9.5a2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 9.5V20h14V9.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9.5 20v-6h5v6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconUsers(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="17" cy="8" r="2.4" />
      <path d="M15.5 14.2c2.6.3 4.5 2.1 4.5 4.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconBarcode(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <path d="M4 5v14M7 5v14M9.5 5v14M13 5v14M15.5 5v14M18 5v14M20 5v14" strokeLinecap="round" />
    </svg>
  );
}

function IconTarget(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4.2" />
      <circle cx="12" cy="12" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

function IconScan(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 12h16" strokeLinecap="round" />
    </svg>
  );
}
