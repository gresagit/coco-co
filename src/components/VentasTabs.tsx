import Link from "next/link";

const TABS = [
  { href: "/dashboard/ventas/pos", label: "Punto de venta" },
  { href: "/dashboard/ventas/pedidos", label: "Pedidos online" },
  { href: "/dashboard/ventas/envios", label: "Envíos" },
  { href: "/dashboard/ventas/vendidos", label: "Vendidos" },
];

export default function VentasTabs({ active }: { active: string }) {
  return (
    <nav aria-label="Secciones de ventas" className="flex flex-wrap gap-2 border-b border-brand-150 pb-3">
      {TABS.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          aria-current={tab.href === active ? "page" : undefined}
          className={`rounded-full px-4 py-2 text-sm ${
            tab.href === active ? "bg-brand-600 text-white" : "bg-brand-50 text-brand-700 hover:bg-brand-100"
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
