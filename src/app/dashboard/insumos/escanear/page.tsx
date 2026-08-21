import { redirect } from "next/navigation";

// El lector de códigos de barra de insumos ahora vive integrado como panel
// plegable dentro de /dashboard/insumos, para tener menos pestañas en el catálogo.
export default function EscanearInsumosPage() {
  redirect("/dashboard/insumos");
}
