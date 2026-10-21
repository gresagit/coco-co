import { redirect } from "next/navigation";
import { getSessionUser, getSucursalActualId } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/server";
import DashboardChrome from "@/components/DashboardChrome";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const db = supabaseAdmin();
  const { data: sucursalesActivas, error } = await db
    .from("sucursales")
    .select("id, nombre")
    .eq("activa", true)
    .order("nombre");
  if (error) throw error;

  const sucursales = user.acceso_todas_sucursales
    ? sucursalesActivas || []
    : (sucursalesActivas || []).filter((sucursal) => user.sucursales.includes(sucursal.id));
  const sucursalCookieId = getSucursalActualId();
  const sucursalActualId = sucursales.some((sucursal) => sucursal.id === sucursalCookieId)
    ? sucursalCookieId
    : null;

  return (
    <DashboardChrome
      nombre={user.nombre_completo}
      usuario={user.usuario}
      roles={user.roles}
      sucursales={sucursales}
      sucursalActualId={sucursalActualId}
      permisos={user.permisos}
    >
      {children}
    </DashboardChrome>
  );
}
