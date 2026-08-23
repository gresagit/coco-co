"use client";

import { useEffect, useState } from "react";

export default function ThemeToggle() {
  // Empieza en null para no "adivinar" antes de leer el valor real ya
  // aplicado por el script inline del <head> (evita parpadeo/flash).
  const [oscuro, setOscuro] = useState<boolean | null>(null);

  useEffect(() => {
    setOscuro(document.documentElement.classList.contains("dark"));
  }, []);

  function alternar() {
    const nuevoOscuro = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", nuevoOscuro);
    localStorage.setItem("coco-theme", nuevoOscuro ? "dark" : "light");
    setOscuro(nuevoOscuro);
  }

  return (
    <button
      type="button"
      onClick={alternar}
      title={oscuro ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
      aria-label="Cambiar tema"
      className="w-9 h-9 shrink-0 rounded-lg border border-brand-200 text-brand-500 flex items-center justify-center hover:border-brand-400 hover:text-ink transition-colors"
    >
      {oscuro === null ? (
        <span className="w-4 h-4" />
      ) : oscuro ? (
        <IconSun className="w-[18px] h-[18px]" />
      ) : (
        <IconMoon className="w-[18px] h-[18px]" />
      )}
    </button>
  );
}

function IconSun({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} className={className}>
      <circle cx="12" cy="12" r="4.2" />
      <path
        d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.55 1.55M17.85 17.85l1.55 1.55M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.55-1.55M17.85 6.15l1.55-1.55"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconMoon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} className={className}>
      <path d="M20 14.2A8.5 8.5 0 1 1 9.8 4a6.7 6.7 0 0 0 10.2 10.2Z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
