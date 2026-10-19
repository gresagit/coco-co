"use client";

import type { ReactNode } from "react";
import { useFormState, useFormStatus } from "react-dom";

export type CrearInsumoState = {
  error?: string;
};

type CrearInsumoAction = (
  state: CrearInsumoState,
  formData: FormData,
) => Promise<CrearInsumoState>;

export default function CrearInsumoForm({
  action,
  children,
  className,
}: {
  action: CrearInsumoAction;
  children: ReactNode;
  className?: string;
}) {
  const [state, formAction] = useFormState(action, {});

  return (
    <form action={formAction} className={className}>
      {state.error && (
        <p role="alert" className="md:col-span-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}
      {children}
    </form>
  );
}

export function CrearInsumoSubmit() {
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending} className="btn-primary disabled:cursor-wait disabled:opacity-70">
      {pending ? "Agregando insumo…" : "Agregar insumo"}
    </button>
  );
}
