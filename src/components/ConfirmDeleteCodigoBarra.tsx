"use client";

type ConfirmDeleteCodigoBarraProps = {
  label?: string;
  descripcion?: string;
  action: () => Promise<void> | void;
};

export function ConfirmDeleteCodigoBarra({
  label = "Eliminar",
  descripcion = "esta tanda",
  action,
}: ConfirmDeleteCodigoBarraProps) {
  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    const confirmado = window.confirm(
      `¿Seguro que quieres borrar ${descripcion}?\n\nSe eliminará la tanda, sus códigos asociados y el historial de impresión relacionado.`
    );
    if (!confirmado) {
      event.preventDefault();
    }
  };

  return (
    <form action={action} onSubmit={handleSubmit} className="inline-block">
      <button type="submit" className="btn text-xs bg-red-600 text-white hover:bg-red-700">
        {label}
      </button>
    </form>
  );
}
