"use client";

import { useState } from "react";
import Link from "next/link";

type ProductoStock = {
  producto_id: string;
  sucursal_id: string;
  cantidad_disponible: number;
  stock_minimo: number;
  productos: { nombre: string } | { nombre: string }[] | null;
  sucursales: { nombre: string } | { nombre: string }[] | null;
};

export default function SemaforoProductos({ productos }: { productos: ProductoStock[] }) {
  const [mostrarDisponibles, setMostrarDisponibles] = useState(true);
  const visibles = productos.filter((producto) =>
    mostrarDisponibles ? producto.cantidad_disponible > 0 : producto.cantidad_disponible <= 0
  );

  return (
    <section className="card">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div>
          <h2 className="font-semibold">
            Semáforo — Producto terminado
          </h2>
          <p className="text-xs text-brand-500 mt-1">
            {mostrarDisponibles ? "Disponibles" : "Sin existencia"}: {visibles.length}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="btn-secondary text-xs"
            onClick={() => setMostrarDisponibles((disponibles) => !disponibles)}
            aria-pressed={!mostrarDisponibles}
          >
            {mostrarDisponibles ? "Ver sin existencia" : "Ver disponibles"}
          </button>
          <Link href="/dashboard/productos" className="text-xs text-brand-600 underline">
            Ver catálogo
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-brand-500 mb-3">
        <span>Verde: sobre el mínimo</span>
        <span>Amarillo: bajo el mínimo</span>
        <span>Rojo: sin existencia</span>
      </div>

      {visibles.length === 0 ? (
        <p className="text-sm text-brand-500">
          {mostrarDisponibles ? "No hay productos con existencia." : "Todos los productos tienen existencia."}
        </p>
      ) : (
        <ul className="space-y-2 max-h-80 overflow-y-auto pr-1">
          {visibles.map((producto) => {
            const nivel =
              producto.cantidad_disponible <= 0
                ? "rojo"
                : producto.cantidad_disponible <= producto.stock_minimo
                ? "amarillo"
                : "verde";
            const nombreProducto = Array.isArray(producto.productos)
              ? producto.productos[0]?.nombre
              : producto.productos?.nombre;
            const nombreSucursal = Array.isArray(producto.sucursales)
              ? producto.sucursales[0]?.nombre
              : producto.sucursales?.nombre;

            return (
              <li
                key={`${producto.producto_id}-${producto.sucursal_id}`}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span>
                  {nombreProducto || "Producto"}{" "}
                  <span className="text-brand-400">· {nombreSucursal || "Sucursal"}</span>
                </span>
                <span className={`badge-${nivel} shrink-0`}>{producto.cantidad_disponible} disp.</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
