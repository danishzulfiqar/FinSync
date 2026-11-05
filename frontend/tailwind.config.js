/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        // Accent: electric yellow (black & yellow premium theme).
        brand: {
          50: "#fefce8",
          100: "#fef9c3",
          200: "#fef08a",
          300: "#fde047",
          400: "#facc15",
          500: "#eab308",
          600: "#ca8a04",
          700: "#a16207",
          800: "#854d0e",
          900: "#713f12",
          950: "#422006",
        },
        // Neutral charcoal scale (replaces Tailwind's blue-tinted slate) so the
        // whole app reads as rich black instead of navy in dark mode.
        slate: {
          50: "#fafafa",
          100: "#f4f4f5",
          200: "#e5e5e8",
          300: "#d1d1d6",
          400: "#9d9da7",
          500: "#70707b",
          600: "#52525e",
          700: "#3a3a44",
          800: "#26262e",
          900: "#161619",
          950: "#0b0b0d",
        },
      },
      boxShadow: {
        card: "0 1px 2px 0 rgb(0 0 0 / 0.03), 0 1px 3px 0 rgb(0 0 0 / 0.05)",
        soft: "0 4px 24px -8px rgb(0 0 0 / 0.12)",
        glow: "0 0 32px -8px rgb(250 204 21 / 0.45)",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "fade-up": {
          from: { opacity: "0", transform: "translateY(18px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-8px)" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
        progress: {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(400%)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.25s ease-out",
        "fade-up": "fade-up 0.6s cubic-bezier(0.22, 1, 0.36, 1) both",
        float: "float 6s ease-in-out infinite",
        shimmer: "shimmer 1.6s infinite",
        progress: "progress 1.4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
