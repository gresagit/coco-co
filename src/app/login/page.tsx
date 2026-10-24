"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [usuario, setUsuario] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [nombreCompleto, setNombreCompleto] = useState("");
  const [nuevoUsuario, setNuevoUsuario] = useState("");
  const [nuevaPassword, setNuevaPassword] = useState("");
  const [mensajeSolicitud, setMensajeSolicitud] = useState<string | null>(null);
  const [errorSolicitud, setErrorSolicitud] = useState<string | null>(null);
  const [enviandoSolicitud, setEnviandoSolicitud] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usuario, password }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.message || "No se pudo iniciar sesión.");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  async function solicitarAcceso(e: React.FormEvent) {
    e.preventDefault();
    setEnviandoSolicitud(true);
    setMensajeSolicitud(null);
    setErrorSolicitud(null);
    try {
      const res = await fetch("/api/auth/solicitud-acceso", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombreCompleto, usuario: nuevoUsuario, password: nuevaPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorSolicitud(data.message || "No se pudo enviar la solicitud.");
        return;
      }
      setMensajeSolicitud(data.message);
      setNombreCompleto("");
      setNuevoUsuario("");
      setNuevaPassword("");
    } catch {
      setErrorSolicitud("No se pudo conectar con el servidor. Intenta de nuevo.");
    } finally {
      setEnviandoSolicitud(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md py-8">
        <div className="text-center mb-8">
          <p className="eyebrow mb-2">Coco & Co.</p>
          <h1 className="page-title">Sistema de inventarios</h1>
          <p className="page-subtitle">Gestión de catálogo, producción y sucursales en la nube.</p>
        </div>
        <form onSubmit={onSubmit} className="card space-y-4">
          <div>
            <label className="label">Usuario</label>
            <input
              className="input"
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
              placeholder=""
              autoFocus
              required
            />
          </div>
          <div>
            <label className="label">Contraseña</label>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder=""
              required
            />
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <button className="btn-primary w-full" disabled={loading}>
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>
        <section className="card mt-4 space-y-3">
          <div>
            <h2 className="font-semibold text-ink">¿Eres nuevo?</h2>
            <p className="text-sm text-brand-500 mt-1">
              Llena la solicitud con tu nombre completo, usuario y contraseña. El administrador revisará tus datos y
              te asignará uno de los perfiles disponibles y las sucursales correspondientes. No podrás iniciar sesión
              hasta que aprueben tu solicitud.
            </p>
          </div>
          <form onSubmit={solicitarAcceso} className="space-y-3">
            <div>
              <label className="label">Nombre completo</label>
              <input
                className="input"
                value={nombreCompleto}
                onChange={(e) => setNombreCompleto(e.target.value)}
                maxLength={120}
                autoComplete="name"
                required
              />
            </div>
            <div>
              <label className="label">Usuario</label>
              <input
                className="input"
                value={nuevoUsuario}
                onChange={(e) => setNuevoUsuario(e.target.value)}
                minLength={3}
                maxLength={32}
                pattern="[A-Za-z0-9._-]+"
                autoComplete="username"
                required
              />
              <p className="text-xs text-brand-400 mt-1">3–32 caracteres: letras, números, punto, guion o guion bajo.</p>
            </div>
            <div>
              <label className="label">Contraseña</label>
              <input
                className="input"
                type="password"
                value={nuevaPassword}
                onChange={(e) => setNuevaPassword(e.target.value)}
                minLength={8}
                maxLength={72}
                autoComplete="new-password"
                required
              />
              <p className="text-xs text-brand-400 mt-1">Usa al menos 8 caracteres.</p>
            </div>
            {errorSolicitud && <p role="alert" className="text-red-600 text-sm">{errorSolicitud}</p>}
            {mensajeSolicitud && <p role="status" className="text-green-700 text-sm">{mensajeSolicitud}</p>}
            <button className="btn-secondary w-full" disabled={enviandoSolicitud}>
              {enviandoSolicitud ? "Enviando..." : "Enviar solicitud de acceso"}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
