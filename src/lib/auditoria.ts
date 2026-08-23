import { getSessionUser, getSucursalActualId } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/server";

export { ROL_ADMINISTRADOR, esAdministrador } from "@/lib/roles";

/**
 * Registra una acción en la tabla `auditoria`.
 *
 * - "quién": se toma de la sesión actual (no se puede falsear desde el cliente).
 * - "cuándo": lo pone la base de datos (default now()).
 * - "dónde": la sucursal activa en la sesión (cookie), si aplica.
 * - "qué"/"cómo": `accion` (string corto, ej. "crear_producto") + `detalle` (jsonb libre).
 *
 * Nunca debe tronar el flujo principal: si falla el registro de auditoría,
 * solo se manda a consola — la acción de negocio ya se hizo y no debe
 * revertirse por un problema de bitácora.
 */
export async function registrarAuditoria(params: {
  accion: string;
  entidad?: string;
  entidadId?: string | null;
  detalle?: Record<string, unknown>;
  sucursalId?: string | null;
}) {
  try {
    const user = await getSessionUser();
    const db = supabaseAdmin();
    const sucursalId = params.sucursalId ?? getSucursalActualId();

    await db.from("auditoria").insert({
      usuario_id: user?.id ?? null,
      sucursal_id: sucursalId,
      accion: params.accion,
      entidad: params.entidad ?? null,
      entidad_id: params.entidadId ?? null,
      detalle: params.detalle ?? null,
    });
  } catch (err) {
    console.error("[auditoria] no se pudo registrar:", err);
  }
}
