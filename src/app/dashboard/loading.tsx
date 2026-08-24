// Next.js muestra este archivo AL INSTANTE en cuanto haces clic en una
// pestaña, mientras la página de verdad trae sus datos del servidor —
// así el cambio se siente inmediato en vez de quedarse "congelado".
// Aplica automáticamente a todas las páginas dentro de /dashboard.
export default function DashboardLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="space-y-2">
        <div className="h-3 w-24 bg-brand-150 rounded" />
        <div className="h-7 w-64 bg-brand-150 rounded" />
        <div className="h-3 w-80 bg-brand-100 rounded" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card h-20" />
        ))}
      </div>

      <div className="card h-64" />
    </div>
  );
}
