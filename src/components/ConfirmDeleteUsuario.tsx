"use client";

type ConfirmDeleteUsuarioProps = {
  usuario: string;
  action: () => Promise<void> | void;
  label?: string;
};

export function ConfirmDeleteUsuario({ usuario, action, label = "Eliminar" }: ConfirmDeleteUsuarioProps) {
  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    const confirmado = window.confirm(`¿Seguro que quieres eliminar al usuario ${usuario}?`);
    if (!confirmado) {
      event.preventDefault();
    }
  };

  return (
    <form action={action} onSubmit={handleSubmit}>
      <button type="submit" className="btn text-xs bg-red-600 text-white hover:bg-red-700">
        {label}
      </button>
    </form>
  );
}
