import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { esAdministrador } from "@/lib/roles";
import { supabaseAdmin } from "@/lib/supabase/server";

// Traduce el nombre técnico de la acción a algo legible en la tabla.
const ETIQUETAS_ACCION: Record<string, string> = {
  login: "Inicio de sesión",
  login_fallido: "Intento de inicio de sesión fallido",
  logout: "Cierre de sesión",
  crear_producto: "Creó un producto",
  editar_producto: "Editó un producto",
  actualizar_precio_manual: "Actualizó precio manual",
  actualizar_stock_minimo: "Actualizó stock mínimo (producto)",
  crear_categoria: "Creó una categoría",
  crear_insumo: "Creó un insumo",
  editar_insumo: "Editó un insumo",
  agregar_entrada_insumo: "Agregó entrada de insumo",
  actualizar_stock_minimo_insumo: "Actualizó stock mínimo (insumo)",
  ajuste_manual_insumo: "Ajuste manual de insumo",
  registrar_derrame_insumo: "Registró derrame/salida de insumo",
  agregar_componente_bom: "Agregó componente a fórmula (BOM)",
  eliminar_componente_bom: "Eliminó componente de fórmula (BOM)",
  crear_transferencia: "Creó transferencia entre sucursales",
  confirmar_recepcion_transferencia: "Confirmó recepción de transferencia",
  crear_usuario: "Creó un usuario",
  cambiar_password: "Cambió una contraseña",
  activar_usuario: "Activó un usuario",
  desactivar_usuario: "Desactivó un usuario",
  crear_rol: "Creó un rol",
  crear_proveedor: "Creó un proveedor",
  asociar_insumo_proveedor: "Asoció insumo a proveedor",
  crear_sucursal: "Creó una sucursal",
  activar_sucursal: "Activó una sucursal",
  desactivar_sucursal: "Desactivó una sucursal",
  crear_regla_alerta: "Creó regla de alerta",
  eliminar_regla_alerta: "Eliminó regla de alerta",
  crear_orden_compra: "Creó orden de compra",
  cambiar_estado_orden_compra: "Cambió estado de orden de compra",
  recibir_mercancia_orden_compra: "Recibió mercancía de orden de compra",
  aprobar_orden_compra: "Dio visto bueno / rechazó orden de compra",
  crear_orden_produccion: "Creó orden de producción",
  reportar_avance_produccion: "Reportó avance de producción",
  aprobar_orden_produccion: "Dio visto bueno / rechazó orden de producción",
  cerrar_orden_produccion: "Cerró orden de producción",
  crear_meta_produccion: "Creó meta de producción",
  registrar_venta_pos: "Registró venta (POS)",
  guardar_config_shopify: "Guardó configuración de Shopify",
  aplicar_ajuste_shopify: "Aplicó ajuste de stock desde Shopify",
  generar_codigos_barra: "Generó códigos de barra",
  generar_codigos_barra_lote: "Generó códigos de barra (lote)",
  registrar_reemplazo_etiquetas: "Registró reemplazo de etiquetas",
  reimprimir_etiqueta: "Reimprimió una etiqueta",
  escanear_pieza: "Escaneó una pieza",
};

function etiquetaAccion(accion: string) {
  return ETIQUETAS_ACCION[accion] || accion;
}

export default async function AuditoriaPage({
  searchParams,
}: {
  searchParams: { usuario_id?: string; accion?: string; sucursal_id?: string; desde?: string; hasta?: string };
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!esAdministrador(user.roles)) {
    redirect("/dashboard");
  }

  const db = supabaseAdmin();

  let query = db
    .from("auditoria")
    .select("*, usuarios(usuario, nombre_completo), sucursales(nombre)")
    .order("fecha", { ascending: false })
    .limit(300);

  if (searchParams.usuario_id) query = query.eq("usuario_id", searchParams.usuario_id);
  if (searchParams.accion) query = query.eq("accion", searchParams.accion);
  if (searchParams.sucursal_id) query = query.eq("sucursal_id", searchParams.sucursal_id);
  if (searchParams.desde) query = query.gte("fecha", `${searchParams.desde}T00:00:00`);
  if (searchParams.hasta) query = query.lte("fecha", `${searchParams.hasta}T23:59:59`);

  const [{ data: usuarios }, { data: sucursales }, { data: eventos }, { data: accionesDistintas }] = await Promise.all([
    db.from("usuarios").select("id, usuario, nombre_completo").order("nombre_completo"),
    db.from("sucursales").select("id, nombre").order("nombre"),
    query,
    // Para el filtro de "Acción" — lista de acciones distintas ya usadas.
    db.from("auditoria").select("accion").limit(1000),
  ]);
  const accionesUnicas = Array.from(new Set((accionesDistintas || []).map((a: any) => a.accion))).sort();

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow mb-1">Administración · 04</p>
        <h1 className="page-title">Auditoría</h1>
        <p className="page-subtitle">
          Bitácora de todo lo que ocurre en el sistema: quién hizo qué, cuándo y en qué sucursal. Solo visible para
          administradores.
        </p>
      </div>

      <form method="get" className="card grid sm:grid-cols-2 md:grid-cols-5 gap-3 items-end">
        <div>
          <label className="label">Usuario</label>
          <select name="usuario_id" defaultValue={searchParams.usuario_id || ""} className="input">
            <option value="">— Todos —</option>
            {(usuarios || []).map((u: any) => (
              <option key={u.id} value={u.id}>
                {u.nombre_completo} (@{u.usuario})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Acción</label>
          <select name="accion" defaultValue={searchParams.accion || ""} className="input">
            <option value="">— Todas —</option>
            {accionesUnicas.map((a) => (
              <option key={a} value={a}>
                {etiquetaAccion(a)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Sucursal</label>
          <select name="sucursal_id" defaultValue={searchParams.sucursal_id || ""} className="input">
            <option value="">— Todas —</option>
            {(sucursales || []).map((s: any) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Desde</label>
          <input name="desde" type="date" defaultValue={searchParams.desde || ""} className="input" />
        </div>
        <div>
          <label className="label">Hasta</label>
          <input name="hasta" type="date" defaultValue={searchParams.hasta || ""} className="input" />
        </div>
        <div className="sm:col-span-2 md:col-span-5 flex gap-2">
          <button className="btn-primary">Filtrar</button>
          <a href="/dashboard/auditoria" className="btn-secondary">
            Limpiar
          </a>
        </div>
      </form>

      <div className="card overflow-x-auto">
        <p className="text-xs text-brand-400 mb-3">
          Mostrando los {eventos?.length || 0} eventos más recientes que cumplen el filtro (máximo 300).
        </p>
        <table className="table-base">
          <thead>
            <tr>
              <th>Cuándo</th>
              <th>Quién</th>
              <th>Qué</th>
              <th>Dónde</th>
              <th>Detalle</th>
            </tr>
          </thead>
          <tbody>
            {(eventos || []).map((e: any) => (
              <tr key={e.id}>
                <td className="text-xs whitespace-nowrap">{new Date(e.fecha).toLocaleString("es-MX")}</td>
                <td className="text-sm">
                  {e.usuarios ? (
                    <>
                      <span className="font-medium text-ink">{e.usuarios.nombre_completo}</span>
                      <span className="text-brand-400"> @{e.usuarios.usuario}</span>
                    </>
                  ) : (
                    <span className="text-brand-400">Sistema</span>
                  )}
                </td>
                <td className="text-sm">
                  <span className="font-medium text-ink">{etiquetaAccion(e.accion)}</span>
                  {e.entidad && <span className="text-brand-400 text-xs"> · {e.entidad}</span>}
                </td>
                <td className="text-sm text-brand-500">{e.sucursales?.nombre || "—"}</td>
                <td className="text-xs text-brand-500 max-w-xs">
                  {e.detalle ? (
                    <code className="break-words whitespace-pre-wrap">{JSON.stringify(e.detalle)}</code>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
            {(eventos || []).length === 0 && (
              <tr>
                <td colSpan={5} className="text-center text-brand-400 py-6">
                  No hay eventos que coincidan con este filtro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
