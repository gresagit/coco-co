import { createClient } from "@supabase/supabase-js";

// Cliente con la service_role key: SOLO se usa en el servidor
// (Server Components, Server Actions, Route Handlers). Nunca exponer
// esta key al navegador.
export function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Faltan variables de entorno de Supabase (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). Revisa tu .env.local o la configuración en Vercel."
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
