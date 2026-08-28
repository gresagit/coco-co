"use client";

import { useState } from "react";

type Props = { kpis: { productos: number; insumos: number; proveedores: number; sucursales: number; ordenesCompra: number; ordenesProduccion: number; ventas30: number; movimientos30: number }; ventasPorDia: { label: string; value: number }[]; movimientosPorTipo: { label: string; value: number }[] };
const reportes = [
  { id: "inventario", titulo: "Inventario general", descripcion: "Existencias, mínimos y valoración por sucursal.", color: "bg-ink" },
  { id: "insumos", titulo: "Insumos y materiales", descripcion: "Catálogo, costos actuales y stock disponible.", color: "bg-accent-500" },
  { id: "productos", titulo: "Productos terminados", descripcion: "SKUs activos, existencias y niveles críticos.", color: "bg-green-700" },
  { id: "ventas", titulo: "Ventas", descripcion: "Ventas POS, folios, medios de pago y totales.", color: "bg-blue-700" },
  { id: "compras", titulo: "Órdenes de compra", descripcion: "Proveedores, estados, fechas y totales.", color: "bg-orange-700" },
  { id: "produccion", titulo: "Producción", descripcion: "Órdenes, avance, merma y lotes fabricados.", color: "bg-purple-700" },
  { id: "proveedores", titulo: "Proveedores", descripcion: "Directorio activo y condiciones de entrega.", color: "bg-teal-700" },
  { id: "clientes", titulo: "Clientes y cotizaciones", descripcion: "Resumen de disponibilidad del módulo comercial.", color: "bg-brand-600" },
];

export default function ReportesDashboard({ kpis, ventasPorDia, movimientosPorTipo }: Props) {
  const [descargando, setDescargando] = useState<string | null>(null);
  const maxVenta = Math.max(...ventasPorDia.map((item) => item.value), 1);
  const maxMovimiento = Math.max(...movimientosPorTipo.map((item) => item.value), 1);
  async function descargar(id: string) {
    setDescargando(id);
    try { const response = await fetch(`/api/reportes/${id}/pdf`); if (!response.ok) throw new Error("No se pudo crear el PDF"); const blob = await response.blob(); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = `reporte-${id}.pdf`; link.click(); URL.revokeObjectURL(url); } finally { setDescargando(null); }
  }
  return <div className="space-y-8 animate-fade-in-up">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow mb-1">Análisis · 08</p><h1 className="page-title">Reportes y gráficos</h1><p className="page-subtitle">Una vista operativa para revisar el negocio y descargar cada informe.</p></div><span className="badge-verde">Datos de los últimos 30 días</span></div>
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3"><Kpi label="Ventas 30 días" value={`$${kpis.ventas30.toLocaleString("es-MX", { maximumFractionDigits: 0 })}`} /><Kpi label="Movimientos" value={kpis.movimientos30} /><Kpi label="Órdenes de compra" value={kpis.ordenesCompra} /><Kpi label="Órdenes de producción" value={kpis.ordenesProduccion} /></div>
    <div className="grid lg:grid-cols-[1.35fr_1fr] gap-5"><section className="card"><div className="flex items-start justify-between mb-5"><div><h2 className="font-semibold">Ventas por día</h2><p className="text-xs text-brand-400 mt-1">Importe registrado en POS</p></div><span className="text-xs text-brand-400">MXN</span></div><div className="h-44 flex items-end gap-2 sm:gap-4 border-b border-brand-150" aria-label="Gráfico de ventas de los últimos siete días">{ventasPorDia.map((item) => <div key={item.label} className="flex-1 h-full flex flex-col justify-end items-center gap-2"><div className="w-full max-w-10 bg-accent-400 rounded-t-md transition-all" style={{ height: `${Math.max((item.value / maxVenta) * 88, item.value ? 8 : 2)}%` }} title={`${item.label}: $${item.value.toFixed(2)}`} /><span className="text-[11px] text-brand-400">{item.label}</span></div>)}</div></section><section className="card"><div className="mb-5"><h2 className="font-semibold">Actividad de inventario</h2><p className="text-xs text-brand-400 mt-1">Movimientos por tipo · 30 días</p></div><div className="space-y-4">{movimientosPorTipo.map((item) => <div key={item.label}><div className="flex justify-between text-sm mb-1"><span>{item.label}</span><strong>{item.value}</strong></div><div className="h-2 bg-brand-100 rounded-full overflow-hidden"><div className="h-full bg-ink rounded-full" style={{ width: `${Math.max((item.value / maxMovimiento) * 100, item.value ? 5 : 0)}%` }} /></div></div>)}</div></section></div>
    <section><div className="flex items-end justify-between mb-3"><div><h2 className="font-semibold">Centro de reportes</h2><p className="text-sm text-brand-500 mt-1">Descarga cada reporte por separado en PDF.</p></div><span className="text-xs text-brand-400">{kpis.productos} productos · {kpis.insumos} insumos · {kpis.proveedores} proveedores</span></div><div className="grid md:grid-cols-2 xl:grid-cols-4 gap-3">{reportes.map((reporte) => <article key={reporte.id} className="card !p-4 flex flex-col min-h-[168px]"><div className={`w-8 h-1 rounded-full ${reporte.color} mb-4`} /><h3 className="font-semibold">{reporte.titulo}</h3><p className="text-sm text-brand-500 mt-1 flex-1">{reporte.descripcion}</p><button type="button" disabled={descargando === reporte.id} onClick={() => descargar(reporte.id)} className="btn-secondary mt-4 w-full disabled:opacity-50">{descargando === reporte.id ? "Preparando PDF..." : "Descargar PDF"}</button></article>)}</div></section>
  </div>;
}
function Kpi({ label, value }: { label: string; value: string | number }) { return <div className="banner !p-4"><p className="text-brand-400 text-[11px] uppercase tracking-wide">{label}</p><p className="font-serif text-2xl text-ink mt-1">{value}</p></div>; }