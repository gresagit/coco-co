import type { Metadata } from "next";
import { Inter, Newsreader } from "next/font/google";
import "./globals.css";

const sans = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const serif = Newsreader({
  subsets: ["latin"],
  style: ["normal", "italic"],
  weight: ["400", "500", "600"],
  variable: "--font-serif",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Coco & Co. | Sistema de Inventarios",
  description: "Sistema de inventarios en la nube — Coco & Co.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${sans.variable} ${serif.variable}`}>
      <head>
        <script
          // Se ejecuta antes de pintar la página para que no haya un
          // "flash" de modo claro justo antes de aplicar modo oscuro.
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('coco-theme');var dark=t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;if(dark)document.documentElement.classList.add('dark');}catch(e){}})();`,
          }}
        />
      </head>
      <body className="bg-cream text-ink min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}
