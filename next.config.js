/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },
  experimental: {
    // Por default, Next.js guarda en el navegador el resultado de cada
    // página dinámica (como las del dashboard, que dependen de la sesión y
    // de la sucursal elegida) hasta por 30 segundos, y lo reutiliza al
    // navegar entre pestañas — por eso a veces se veía información vieja
    // hasta forzar un recargue manual. Con esto, cada clic en una pestaña
    // vuelve a pedir los datos frescos al servidor.
    staleTimes: {
      dynamic: 0,
      static: 180,
    },
  },
};
module.exports = nextConfig;
