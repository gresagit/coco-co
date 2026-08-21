import { redirect } from "next/navigation";

// El lector de códigos de barra ahora vive integrado como panel plegable
// dentro de /dashboard/productos, para tener menos pestañas en el catálogo.
export default function EscanearPage() {
  redirect("/dashboard/productos");
}
