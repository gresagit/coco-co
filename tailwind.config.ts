import type { Config } from "tailwindcss";
const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // Paleta neutra tipo editorial (crema / carbón), con un solo acento cálido.
        brand: {
          50: "#F1EFEA",
          100: "#e7e3da",
          200: "#d6d0c2",
          150: "#e0dbcf",
          300: "#b9b09a",
          400: "#8f8571",
          500: "#6b6250",
          600: "#4a4436",
          700: "#332f26",
          800: "#242119",
          900: "#17150f",
        },
        accent: {
          50: "#fbf1ea",
          100: "#f4dcc9",
          200: "#e8ba95",
          300: "#d99860",
          400: "#c47a3c",
          500: "#a8632c",
          600: "#8a4f23",
          700: "#6b3d1c",
        },
        ink: "#17150f",
        cream: "#F1EFEA",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        serif: ["var(--font-serif)", "Georgia", "serif"],
      },
      letterSpacing: {
        widest2: "0.18em",
      },
      boxShadow: {
        soft: "0 1px 2px rgba(23, 21, 15, 0.04), 0 1px 12px rgba(23, 21, 15, 0.03)",
      },
    },
  },
  plugins: [],
};
export default config;
