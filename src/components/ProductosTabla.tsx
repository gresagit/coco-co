"use client";

import Link from "next/link";
import { useState, useTransition, type SVGProps } from "react";

type Categoria = { id: string; nombre: string };
type Producto = {
  id: string;
  sku: string;
  nombre: string;
  categoria_id: string | null;
  categorias?: { nombre: string } | null;
  stock: number;
  costo: number;
  precio: number;
  precio_venta_override: number | null;
  porcentaje_margen_deseado: number;
  activo?: boolean;
};

export default function ProductosTabla({
  productos,
  categorias,
  editarProducto,
  eliminarProducto,
}: {
  productos: Producto[];
  categorias: Categoria[];
  editarProducto: (formData: FormData) => Promise<void>;
  eliminarProducto: (productoId: string) => Promise<void>;
}) {
  const [editando, setEditando] = useState<Producto | null>(null);
  const [search, setSearch] = useState("");
  const [eliminandoId, setEliminandoId] = useState<string | null>(null);
  const [errorEliminar, setErrorEliminar] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function onEliminar(producto: Producto) {
    const confirmado = window.confirm(
      `¿Eliminar "${producto.nombre}"? Si ya tiene historial de producción o ventas, en vez de borrarse se marcará como inactivo.`
    );
    if (!confirmado) return;

    setErrorEliminar(null);
    setEliminandoId(producto.id);
    startTransition(async () => {
      try {
        await eliminarProducto(producto.id);
      } catch {
        setErrorEliminar(`No se pudo eliminar "${producto.nombre}".`);
      } finally {
        setEliminandoId(null);
      }
    });
  }

  const productosFiltrados = productos.filter((p) => {
    const query = search.trim().toLowerCase();
    if (!query) return true;

    const categoria = p.categorias?.nombre?.toLowerCase() || "";
    return (
      p.nombre.toLowerCase().includes(query) ||
      p.sku.toLowerCase().includes(query) ||
      categoria.includes(query)
    );
  });

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="font-semibold text-ink">Productos</h2>
          <p className="text-xs text-brand-400">{productosFiltrados.length} resultados</p>
        </div>
        <label className="relative block w-full max-w-sm">
          <span className="sr-only">Buscar productos</span>
          <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-brand-400">
            <IconSearch className="w-4 h-4" />
          </span>
          <input
            id="productos-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre, SKU o categoría"
            className="input pl-9"
          />
        </label>
      </div>

      {errorEliminar && (
        <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
          {errorEliminar}
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th>SKU</th>
              <th>Nombre</th>
              <th>Categoría</th>
              <th>Stock</th>
              <th>Costo (auto)</th>
              <th>Precio sugerido</th>
              <th>Margen</th>
              <th className="text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {productosFiltrados.map((p) => (
              <tr key={p.id} className={p.activo === false ? "opacity-50" : ""}>
                <td className="font-mono text-xs">{p.sku}</td>
                <td className="font-medium">
                  {p.nombre}
                  {p.activo === false && (
                    <span className="ml-2 inline-block rounded-full border border-brand-200 px-2 py-0.5 text-[10px] uppercase tracking-wide text-brand-400">
                      Inactivo
                    </span>
                  )}
                </td>
                <td>{p.categorias?.nombre || "—"}</td>
                <td className="font-medium">{p.stock}</td>
                <td>${p.costo.toFixed(2)}</td>
                <td>
                  ${p.precio.toFixed(2)}
                  {p.precio_venta_override && <span className="text-xs text-brand-400 ml-1">(manual)</span>}
                </td>
                <td>{(Number(p.porcentaje_margen_deseado) * 100).toFixed(0)}%</td>
                <td>
                  <div className="flex items-center justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => setEditando(p)}
                      title="Editar producto"
                      className="w-8 h-8 rounded-lg border border-brand-200 text-brand-500 flex items-center justify-center hover:border-ink hover:text-ink hover:bg-brand-50 transition-colors"
                    >
                      <IconEdit className="w-4 h-4" />
                    </button>
                    <Link
                      href={`/dashboard/productos/${p.id}`}
                      title="Detalle y stock por sucursal"
                      className="w-8 h-8 rounded-lg border border-brand-200 text-brand-500 flex items-center justify-center hover:border-ink hover:text-ink hover:bg-brand-50 transition-colors"
                    >
                      <IconBox className="w-4 h-4" />
                    </Link>
                    <Link
                      href={`/dashboard/bom?producto=${p.id}`}
                      title="Editar fórmula (BOM)"
                      className="w-8 h-8 rounded-lg border border-brand-200 text-brand-500 flex items-center justify-center hover:border-ink hover:text-ink hover:bg-brand-50 transition-colors"
                    >
                      <IconBeaker className="w-4 h-4" />
                    </Link>
                    <button
                      type="button"
                      onClick={() => onEliminar(p)}
                      disabled={eliminandoId === p.id}
                      title="Eliminar producto"
                      className="w-8 h-8 rounded-lg border border-brand-200 text-red-500 flex items-center justify-center hover:border-red-400 hover:bg-red-50 transition-colors disabled:opacity-50"
                    >
                      <IconTrash className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {productosFiltrados.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center text-brand-400 py-6">
                  No se encontraron productos con ese término.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editando && (
        <ModalEditarProducto
          producto={editando}
          categorias={categorias}
          editarProducto={editarProducto}
          onClose={() => setEditando(null)}
        />
      )}
    </div>
  );
}

function ModalEditarProducto({
  producto,
  categorias,
  editarProducto,
  onClose,
}: {
  producto: Producto;
  categorias: Categoria[];
  editarProducto: (formData: FormData) => Promise<void>;
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [usarNuevaCategoria, setUsarNuevaCategoria] = useState(false);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      await editarProducto(formData);
      onClose();
    });
  }

  return (
    <div
      className="fixed inset-0 bg-ink/40 z-40 flex items-center justify-center p-4 animate-fade-in"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="bg-surface border border-brand-150 rounded-xl shadow-soft w-full max-w-lg p-6 animate-fade-in-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="font-semibold text-ink">Editar producto</h2>
            <p className="text-xs text-brand-400 font-mono mt-0.5">{producto.sku}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="text-brand-400 hover:text-ink p-1 -m-1 shrink-0"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <input type="hidden" name="producto_id" value={producto.id} />

          <div>
            <label className="label">Nombre</label>
            <input name="nombre" className="input" defaultValue={producto.nombre} required />
          </div>

          <div>
            <label className="label">Categoría</label>
            {!usarNuevaCategoria ? (
              <>
                <select name="categoria_id" className="input" defaultValue={producto.categoria_id || ""}>
                  <option value="">— Ninguna —</option>
                  {categorias.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setUsarNuevaCategoria(true)}
                  className="text-xs text-brand-600 underline mt-1.5"
                >
                  + Crear una categoría nueva
                </button>
              </>
            ) : (
              <>
                <input name="categoria_nueva" className="input" placeholder="Ej. Jabones" autoFocus />
                <button
                  type="button"
                  onClick={() => setUsarNuevaCategoria(false)}
                  className="text-xs text-brand-600 underline mt-1.5"
                >
                  Usar una categoría existente
                </button>
              </>
            )}
          </div>

          <div>
            <label className="label">Margen de ganancia deseado (ej. 0.30 = 30%)</label>
            <input
              name="margen"
              type="number"
              step="0.01"
              min="0"
              max="0.99"
              defaultValue={producto.porcentaje_margen_deseado}
              className="input"
            />
            <p className="text-xs text-brand-400 mt-1">
              El precio sugerido se recalcula automáticamente a partir del costo (BOM) y este margen.
            </p>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary" disabled={pending}>
              Cancelar
            </button>
            <button type="submit" className="btn-primary" disabled={pending}>
              {pending ? "Guardando…" : "Guardar cambios"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function IconEdit(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} {...props}>
      <path d="M15.5 5.5 18.5 8.5 8 19H5v-3L15.5 5.5Z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconBox(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} {...props}>
      <path d="m4 8 8-4 8 4-8 4-8-4Z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 8v8l8 4 8-4V8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 12v8" strokeLinecap="round" />
    </svg>
  );
}

function IconBeaker(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} {...props}>
      <path d="M9 3h6" strokeLinecap="round" />
      <path d="M10 3v6.5L4.8 18a1.6 1.6 0 0 0 1.4 2.4h11.6a1.6 1.6 0 0 0 1.4-2.4L14 9.5V3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7.5 15h9" strokeLinecap="round" />
    </svg>
  );
}

function IconTrash(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} {...props}>
      <path d="M5 7h14" strokeLinecap="round" />
      <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7 7l1 12.5A1.5 1.5 0 0 0 9.5 21h5a1.5 1.5 0 0 0 1.5-1.5L17 7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 11v6M14 11v6" strokeLinecap="round" />
    </svg>
  );
}

function IconSearch(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} {...props}>
      <circle cx="11" cy="11" r="5.5" strokeLinecap="round" />
      <path d="m16 16 4 4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
