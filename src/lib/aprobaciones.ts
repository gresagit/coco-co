import { supabaseAdmin } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth";
import { esAdministrador } from "@/lib/roles";
import { registrarAuditoria } from "@/lib/auditoria";

export type TablaAprobable = "ordenes_compra" | "ordenes_produccion";

/**
 * Da visto bueno (o rechaza) una orden de producción o de compra.
 * Solo un usuario con rol Administrador puede ejecutar esto — se valida
 * aquí mismo (server-side) y no solo ocultando el botón en la UI.
 */
export async function resolverAprobacion(params: {
  tabla: TablaAprobable;
  id: string;
  decision: "Aprobada" | "Rechazada";
  comentario?: string | null;
}) {
  const user = await getSessionUser();
  if (!user) throw new Error("NO_AUTH");
  if (!esAdministrador(user.roles)) {
    throw new Error("SOLO_ADMIN_PUEDE_APROBAR");
  }

  const db = supabaseAdmin();
  const { data: orden, error } = await db
    .from(params.tabla)
    .update({
      aprobacion_estado: params.decision,
      aprobado_por: user.id,
      aprobado_en: new Date().toISOString(),
      comentario_aprobacion: params.comentario?.trim() || null,
    })
    .eq("id", params.id)
    .select()
    .single();

  if (error) throw error;

  await registrarAuditoria({
    accion: params.tabla === "ordenes_compra" ? "aprobar_orden_compra" : "aprobar_orden_produccion",
    entidad: params.tabla,
    entidadId: params.id,
    detalle: { decision: params.decision, comentario: params.comentario || null },
  });

  return orden;
}
