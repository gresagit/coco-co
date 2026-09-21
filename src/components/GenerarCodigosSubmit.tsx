"use client";

import { useFormStatus } from "react-dom";

export default function GenerarCodigosSubmit() {
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending} className="btn-primary inline-flex items-center gap-2 disabled:cursor-wait disabled:opacity-70">
      {pending && <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
      {pending ? "Generando códigos…" : "Generar códigos"}
    </button>
  );
}