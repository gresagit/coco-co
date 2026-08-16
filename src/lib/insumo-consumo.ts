// Descuenta un insumo del inventario de una sucursal, aplicando FEFO
// (primero en caducar, primero en salir) cuando el insumo lo requiere.
// Puede quedar ligado a un reporte de avance (lote) o a una pieza individual
// confirmada por escaneo — cualquiera de los dos sirve como trazabilidad.
export async function descontarInsumo(
  db: any,
  insumoId: string,
  sucursalId: string,
  cantidad: number,
  origen: { reporteAvanceId?: string; piezaId?: string }
) {
  const { data: insumo } = await db.from("insumos").select("*").eq("id", insumoId).single();
  if (!insumo) return;

  if (insumo.controla_caducidad) {
    // FEFO: descuenta de los lotes con caducidad más próxima primero
    let restante = cantidad;
    const { data: lotesInsumo } = await db
      .from("insumo_lotes")
      .select("*")
      .eq("insumo_id", insumoId)
      .eq("sucursal_id", sucursalId)
      .gt("cantidad_restante", 0)
      .order("fecha_caducidad", { ascending: true });

    for (const lote of lotesInsumo || []) {
      if (restante <= 0) break;
      const tomar = Math.min(Number(lote.cantidad_restante), restante);
      await db.from("insumo_lotes").update({ cantidad_restante: Number(lote.cantidad_restante) - tomar }).eq("id", lote.id);
      await db.from("reporte_consumo_insumos").insert({
        reporte_avance_id: origen.reporteAvanceId || null,
        pieza_id: origen.piezaId || null,
        insumo_id: insumoId,
        cantidad_consumida: tomar,
        insumo_lote_id: lote.id,
      });
      restante -= tomar;
    }
  } else {
    await db.from("reporte_consumo_insumos").insert({
      reporte_avance_id: origen.reporteAvanceId || null,
      pieza_id: origen.piezaId || null,
      insumo_id: insumoId,
      cantidad_consumida: cantidad,
    });
  }

  const { data: stockRow } = await db
    .from("insumo_stock")
    .select("*")
    .eq("insumo_id", insumoId)
    .eq("sucursal_id", sucursalId)
    .maybeSingle();

  if (stockRow) {
    await db
      .from("insumo_stock")
      .update({ cantidad_disponible: Number(stockRow.cantidad_disponible) - cantidad })
      .eq("id", stockRow.id);
  }

  await db.from("movimientos").insert({
    tipo: "Salida",
    origen_tipo: "Insumo",
    insumo_id: insumoId,
    sucursal_id: sucursalId,
    cantidad,
    referencia: "Consumo de producción (BOM)",
  });
}
