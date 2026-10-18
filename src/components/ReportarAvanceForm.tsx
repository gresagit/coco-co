"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";

type ResultadoReporte = { ok: boolean; mensaje?: string };

export default function ReportarAvanceForm({
  action,
}: {
  action: (formData: FormData) => Promise<ResultadoReporte>;
}) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function enviarReporte(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setError(null);

    startTransition(async () => {
      try {
        const resultado = await action(formData);
        if (!resultado.ok) {
          setError(resultado.mensaje || "No se pudo registrar el avance.");
          return;
        }
        form.reset();
        router.refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "No se pudo registrar el avance.");
      }
    });
  }

  return (
    <form onSubmit={enviarReporte} className="grid md:grid-cols-4 gap-3 items-end">
      <div>
        <label className="label">Fecha</label>
        <input name="fecha" type="date" className="input" defaultValue={new Date().toISOString().slice(0, 10)} />
      </div>
      <div>
        <label className="label">Cantidad producida</label>
        <input name="cantidad_producida" type="number" step="0.01" className="input" required />
      </div>
      <div>
        <label className="label">Merma</label>
        <input name="cantidad_merma" type="number" step="0.01" className="input" defaultValue={0} />
      </div>
      <div>
        <label className="label">Notas</label>
        <input name="notas" className="input" />
      </div>
      {error && (
        <p className="md:col-span-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
      <div className="md:col-span-4">
        <button className="btn-primary" disabled={pendiente}>
          {pendiente ? "Registrando avance..." : "Registrar reporte de avance"}
        </button>
      </div>
    </form>
  );
}
