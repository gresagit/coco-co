import { redirect } from "next/navigation";
import { getSessionUser, getSucursalActualId } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/server";
import DashboardChrome from "@/components/DashboardChrome";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const db = supabaseAdmin();
  let query = db.from("sucursales").select("id, nombre").eq("activa", true).order("nombre");
  if (!user.acceso_todas_sucursales && user.sucursales.length > 0) {
    query = query.in("id", user.sucursales);
  }
  const { data: sucursales } = await query;

  return (
    <DashboardChrome
      nombre={user.nombre_completo}
      usuario={user.usuario}
      roles={user.roles}
      sucursales={sucursales || []}
      sucursalActualId={getSucursalActualId()}
    >
      {children}
    </DashboardChrome>
  );
}
