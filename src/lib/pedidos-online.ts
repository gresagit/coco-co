import { redirect } from "next/navigation";
import { getSessionUser, getSucursalActualId, type SessionUser } from "@/lib/auth";
import { esAdministrador, tienePermiso } from "@/lib/roles";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function exigirPermisoPedidosOnline(accion: "ver" | "editar" = "ver"): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!esAdministrador(user.roles) && !tienePermiso(user.permisos, "pedidos_online", accion)) {
    redirect("/dashboard");
  }
  return user;
}

export function usuarioPuedeAccederSucursal(user: SessionUser, sucursalId: string) {
  return user.acceso_todas_sucursales || user.sucursales.includes(sucursalId);
}

export async function sucursalActualRequerida(user: SessionUser) {
  const sucursalId = getSucursalActualId();
  if (!sucursalId) throw new Error("Elige una sucursal antes de gestionar pedidos online.");
  if (!usuarioPuedeAccederSucursal(user, sucursalId)) {
    throw new Error("No tienes acceso a la sucursal seleccionada.");
  }
  const { data: sucursal, error } = await supabaseAdmin()
    .from("sucursales")
    .select("id")
    .eq("id", sucursalId)
    .eq("activa", true)
    .maybeSingle();
  if (error) throw error;
  if (!sucursal) throw new Error("La sucursal seleccionada ya no está activa.");
  return sucursalId;
}
