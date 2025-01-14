import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/{**,.client,.server}/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      keyframes: {
        sound: {
          "0%": { opacity: "0.35", height: "20px" },
          "40%": { opacity: "0.35", height: "35px" },
          "100%": { opacity: "1", height: "70px" },
        },
      },
      animation: {
        sound: "sound 0ms -600ms linear infinite alternate",
      },
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
          "Apple Color Emoji",
          "Segoe UI Emoji",
          "Segoe UI Symbol",
          "Noto Color Emoji",
        ],
      },
    },
  },
  plugins: [],
} satisfies Config;
