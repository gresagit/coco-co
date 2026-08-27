export const ROL_ADMINISTRADOR = "Administrador";

export const APARTADOS_SISTEMA = [
  { clave: "productos", etiqueta: "Productos terminados", grupo: "Catálogo", ruta: "/dashboard/productos" },
  { clave: "insumos", etiqueta: "Insumos", grupo: "Catálogo", ruta: "/dashboard/insumos" },
  { clave: "bom", etiqueta: "Fórmulas (BOM)", grupo: "Catálogo", ruta: "/dashboard/bom" },
  { clave: "codigos_barra", etiqueta: "Códigos de barra", grupo: "Catálogo", ruta: "/dashboard/codigos-barra" },
  { clave: "ventas_stock", etiqueta: "Stock Shopify", grupo: "Ventas", ruta: "/dashboard/ventas/stock" },
  { clave: "ventas_pos", etiqueta: "Ventas punto de venta", grupo: "Ventas", ruta: "/dashboard/ventas/pos" },
  { clave: "produccion", etiqueta: "Producción", grupo: "Operación", ruta: "/dashboard/produccion" },
  { clave: "movimientos", etiqueta: "Movimientos", grupo: "Operación", ruta: "/dashboard/movimientos" },
  { clave: "alertas", etiqueta: "Alertas", grupo: "Operación", ruta: "/dashboard/alertas" },
  { clave: "proveedores", etiqueta: "Proveedores", grupo: "Compras", ruta: "/dashboard/proveedores" },
  { clave: "ordenes_compra", etiqueta: "Órdenes de compra", grupo: "Compras", ruta: "/dashboard/ordenes-compra" },
  { clave: "metas", etiqueta: "Metas de producción", grupo: "Administración", ruta: "/dashboard/metas" },
  { clave: "sucursales", etiqueta: "Sucursales", grupo: "Administración", ruta: "/dashboard/sucursales" },
  { clave: "usuarios", etiqueta: "Usuarios y roles", grupo: "Administración", ruta: "/dashboard/usuarios" },
  { clave: "auditoria", etiqueta: "Auditoría", grupo: "Administración", ruta: "/dashboard/auditoria" },
] as const;

export type Permisos = Record<string, string[]>;

export function tienePermiso(permisos: Permisos | undefined, apartado: string, accion = "ver"): boolean {
  return !!permisos?.[apartado]?.includes(accion) || !!permisos?.["*"]?.includes("*");
}

export function esAdministrador(roles: string[] | undefined | null): boolean {
  return !!roles?.includes(ROL_ADMINISTRADOR);
}
