import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          primary: {
            DEFAULT: "var(--brand-primary)",
            hover: "var(--brand-primary-hover)",
          },
          secondary: {
            DEFAULT: "var(--brand-secondary)",
          }
        },
        surface: {
          background: "var(--surface-bg)",
          paper: "var(--surface-paper)",
          border: "var(--surface-border)",
        },
        txt: {
          primary: "var(--text-primary)",
          secondary: "var(--text-secondary)",
        }
      },
    },
  },
  plugins: [],
};
export default config;
