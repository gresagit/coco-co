import { supabaseAdmin } from "@/lib/supabase/server";
import { generarTandaCodigosBarra } from "@/lib/codigos-barra";

/**
 * Panorama de decisión para Administración: por cada producto de una
 * sucursal, cuánto hay en stock, qué pide su fórmula, cuánta materia prima
 * hay disponible para eso, y qué tan urgente/caro/lento es reponer lo que
 * falte. Con esto Administración decide cuánto producir y en cuánto tiempo,
 * sin tener que ir módulo por módulo a buscar el dato.
 */
export type PanoramaInsumo = {
  insumoId: string;
  nombre: string;
  unidadMedida: string;
  cantidadPorUnidad: number;
  disponible: number;
  stockMinimo: number;
  costoUnitario: number;
  tiempoEntregaDias: number | null;
  // Cuántas unidades del producto alcanzan a fabricarse con lo que hay
  // disponible de este insumo, antes de comprar más.
  unidadesFabricablesConStockActual: number;
  urgente: boolean;
};

export type PanoramaProducto = {
  productoId: string;
  nombre: string;
  sku: string;
  stockActual: number;
  metasActivas: { id: string; cantidadMeta: number; escaneadas: number; fechaLimite: string | null }[];
  insumos: PanoramaInsumo[];
  // El menor "unidadesFabricablesConStockActual" entre todos los insumos:
  // el verdadero techo de cuánto se puede producir hoy sin comprar nada más.
  maximoFabricableHoy: number | null;
};

export async function obtenerPanoramaProduccion(sucursalId: string): Promise<PanoramaProducto[]> {
  const db = supabaseAdmin();

  const { data: productos } = await db
    .from("productos")
    .select("id, nombre, sku")
    .eq("activo", true)
    .order("nombre");

  const resultado: PanoramaProducto[] = [];

  for (const producto of productos || []) {
    const { data: stockRow } = await db
      .from("producto_stock")
      .select("cantidad_disponible")
      .eq("producto_id", producto.id)
      .eq("sucursal_id", sucursalId)
      .maybeSingle();

    const { data: metasActivasRows } = await db
      .from("metas_produccion")
      .select("id, cantidad_meta, fecha_limite")
      .eq("producto_id", producto.id)
      .eq("sucursal_id", sucursalId)
      .eq("estado", "Activa");

    const metasActivas = [];
    for (const meta of metasActivasRows || []) {
      const { count } = await db
        .from("piezas")
        .select("*", { count: "exact", head: true })
        .eq("meta_id", meta.id)
        .eq("estado", "Disponible");
      metasActivas.push({
        id: meta.id,
        cantidadMeta: meta.cantidad_meta,
        escaneadas: count || 0,
        fechaLimite: meta.fecha_limite,
      });
    }

    const { data: bomItems } = await db
      .from("bom")
      .select("insumo_id, cantidad_por_unidad, unidad, insumos(id, nombre, unidad_medida, costo_unitario_actual)")
      .eq("producto_id", producto.id)
      .not("insumo_id", "is", null);

    const insumos: PanoramaInsumo[] = [];
    for (const item of bomItems || []) {
      const insumo: any = item.insumos;
      if (!insumo) continue;

      const { data: insumoStock } = await db
        .from("insumo_stock")
        .select("cantidad_disponible, stock_minimo")
        .eq("insumo_id", insumo.id)
        .eq("sucursal_id", sucursalId)
        .maybeSingle();

      const { data: preferido } = await db
        .from("insumo_proveedores")
        .select("proveedores(tiempo_entrega_dias)")
        .eq("insumo_id", insumo.id)
        .eq("es_preferido", true)
        .maybeSingle();

      const disponible = Number(insumoStock?.cantidad_disponible || 0);
      const stockMinimo = Number(insumoStock?.stock_minimo || 0);
      const cantidadPorUnidad = Number(item.cantidad_por_unidad);
      const unidadesFabricables = cantidadPorUnidad > 0 ? Math.floor(disponible / cantidadPorUnidad) : Infinity;

      insumos.push({
        insumoId: insumo.id,
        nombre: insumo.nombre,
        unidadMedida: insumo.unidad_medida,
        cantidadPorUnidad,
        disponible,
        stockMinimo,
        costoUnitario: Number(insumo.costo_unitario_actual || 0),
        tiempoEntregaDias: (preferido?.proveedores as any)?.tiempo_entrega_dias ?? null,
        unidadesFabricablesConStockActual: unidadesFabricables,
        urgente: disponible <= stockMinimo,
      });
    }

    const finitos = insumos
      .map((i) => i.unidadesFabricablesConStockActual)
      .filter((n) => Number.isFinite(n)) as number[];

    resultado.push({
      productoId: producto.id,
      nombre: producto.nombre,
      sku: producto.sku,
      stockActual: Number(stockRow?.cantidad_disponible || 0),
      metasActivas,
      insumos,
      maximoFabricableHoy: finitos.length ? Math.min(...finitos) : null,
    });
  }

  return resultado;
}

/**
 * Crea una meta de producción para un producto en una sucursal y genera de
 * inmediato sus códigos de barra en estado "Pendiente" — listos para
 * mandar a imprimir. El avance se confirma después, pieza por pieza, al
 * escanearlas.
 */
export async function crearMetaProduccion(params: {
  productoId: string;
  sucursalId: string;
  cantidadMeta: number;
  fechaLimite?: string;
  creadoPor?: string;
}) {
  const db = supabaseAdmin();

  const { data: meta, error } = await db
    .from("metas_produccion")
    .insert({
      producto_id: params.productoId,
      sucursal_id: params.sucursalId,
      cantidad_meta: params.cantidadMeta,
      fecha_limite: params.fechaLimite || null,
      creado_por: params.creadoPor || null,
    })
    .select()
    .single();
  if (error || !meta) throw error || new Error("No se pudo crear la meta");

  await generarTandaCodigosBarra({
    productoId: params.productoId,
    sucursalId: params.sucursalId,
    cantidad: params.cantidadMeta,
    modo: "sin_lote",
    metaId: meta.id,
    estadoInicial: "Pendiente",
  });

  return meta;
}
