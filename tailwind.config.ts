import type { Config } from "tailwindcss";
const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f4f7f2",
          100: "#e5ebe0",
          200: "#cddac3",
          300: "#adc29d",
          400: "#88a475",
          500: "#5c7a4f",
          600: "#4a6440",
          700: "#3b4f34",
          800: "#2f3f2a",
          900: "#26331f",
        },
      },
    },
  },
  plugins: [],
};
export default config;
