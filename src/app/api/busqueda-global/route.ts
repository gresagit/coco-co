import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth";

type SearchResult = {
  label: string;
  type: string;
  path: string;
  metadata?: string;
};

const secciones = [
  { label: "Dashboard", path: "/dashboard", keywords: ["inicio", "home", "panel", "principal"] },
  { label: "Productos", path: "/dashboard/productos", keywords: ["producto", "productos", "catalogo", "inventario", "stock"] },
  { label: "Insumos", path: "/dashboard/insumos", keywords: ["insumo", "insumos", "materiales", "materia prima"] },
  { label: "Clientes", path: "/dashboard/ventas/pos", keywords: ["cliente", "clientes", "ventas", "pos", "comercial"] },
  { label: "Proveedores", path: "/dashboard/proveedores", keywords: ["proveedor", "proveedores", "suministros"] },
  { label: "Sucursales", path: "/dashboard/sucursales", keywords: ["sucursal", "sucursales", "tiendas", "locales"] },
  { label: "Órdenes de compra", path: "/dashboard/ordenes-compra", keywords: ["ordenes", "orden de compra", "compras", "pedidos"] },
  { label: "Producción", path: "/dashboard/produccion", keywords: ["produccion", "fabricacion", "lotes", "etiquetas"] },
  { label: "Reportes", path: "/dashboard/reportes", keywords: ["reportes", "reporte", "estadisticas", "graficas", "charts", "dashboard"] },
  { label: "Auditoría", path: "/dashboard/auditoria", keywords: ["auditoria", "logs", "acciones", "historial"] },
  { label: "Usuarios", path: "/dashboard/usuarios", keywords: ["usuarios", "usuario", "equipo", "roles", "personal"] },
  { label: "Ventas", path: "/dashboard/ventas/pos", keywords: ["ventas", "venta", "carrito", "transacciones"] },
  { label: "Alertas", path: "/dashboard/alertas", keywords: ["alertas", "stock bajo", "notificaciones", "inventario crítico"] },
  { label: "Movimientos", path: "/dashboard/movimientos", keywords: ["movimientos", "traspasos", "entradas", "salidas", "transferencias"] },
];

function crearResultado(label: string, type: string, path: string, metadata?: string): SearchResult {
  return {
    label,
    type,
    path,
    metadata: metadata || undefined,
  };
}

export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ ok: false, results: [] }, { status: 401 });
  }

  const query = request.nextUrl.searchParams.get("q")?.trim() || "";
  if (!query) {
    return NextResponse.json({ ok: true, results: [] });
  }

  const buscado = query.toLowerCase();
  const db = supabaseAdmin();

  const resultados: SearchResult[] = [];

  for (const seccion of secciones) {
    const texto = `${seccion.label} ${seccion.keywords.join(" ")}`.toLowerCase();
    if (texto.includes(buscado)) {
      resultados.push(crearResultado(seccion.label, "Sección", seccion.path));
    }
  }

  const [productos, insumos, proveedores, sucursales, usuarios, clientes] = await Promise.all([
    db.from("productos").select("id, nombre, sku").ilike("nombre", `%${query}%`).limit(5),
    db
      .from("insumos")
      .select("id, nombre, codigo_interno")
      .or(`nombre.ilike.%${query}%,codigo_interno.ilike.%${query}%`)
      .limit(5),
    db.from("proveedores").select("id, nombre").ilike("nombre", `%${query}%`).limit(5),
    db.from("sucursales").select("id, nombre").ilike("nombre", `%${query}%`).limit(5),
    db
      .from("usuarios")
      .select("id, nombre_completo, usuario")
      .or(`nombre_completo.ilike.%${query}%,usuario.ilike.%${query}%`)
      .limit(5),
    db
      .from("clientes")
      .select("id, nombre, apellido, telefono")
      .or(`nombre.ilike.%${query}%,apellido.ilike.%${query}%,telefono.ilike.%${query}%`)
      .limit(5),
  ]);

  const bloqueResultados: SearchResult[] = [
    ...((productos.data || []).map((item: any) => crearResultado(`${item.nombre} · ${item.sku}`, "Producto", "/dashboard/productos", item.sku))),
    ...((insumos.data || []).map((item: any) => crearResultado(`${item.nombre} · ${item.codigo_interno || "sin código"}`, "Insumo", "/dashboard/insumos", item.codigo_interno || "Insumo"))),
    ...((proveedores.data || []).map((item: any) => crearResultado(item.nombre, "Proveedor", "/dashboard/proveedores"))),
    ...((sucursales.data || []).map((item: any) => crearResultado(item.nombre, "Sucursal", "/dashboard/sucursales"))),
    ...((usuarios.data || []).map((item: any) => crearResultado(`${item.nombre_completo || item.usuario} · ${item.usuario || "usuario"}`, "Usuario", "/dashboard/usuarios"))),
    ...((clientes.data || []).map((item: any) => crearResultado(`${item.nombre} ${item.apellido}`.trim() || item.telefono, "Cliente", "/dashboard/ventas/pos", item.telefono || "Cliente"))),
  ];

  for (const item of bloqueResultados) {
    const existe = resultados.some((actual) => actual.path === item.path && actual.label === item.label);
    if (!existe) {
      resultados.push(item);
    }
  }

  const finalResults = resultados
    .filter((item) => {
      const hayTexto = `${item.label} ${item.type} ${item.metadata || ""}`.toLowerCase();
      return hayTexto.includes(buscado);
    })
    .slice(0, 12);

  return NextResponse.json({ ok: true, results: finalResults });
}
