import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Coco & Co. | Sistema de Inventarios",
  description: "Sistema de inventarios en la nube — Coco & Co.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="bg-brand-50 text-brand-900 min-h-screen">{children}</body>
    </html>
  );
}
