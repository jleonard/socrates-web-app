import type { Config } from "tailwindcss";

import {
  actionColors,
  borderColors,
  surfaceColors,
  textColors,
} from "./app/theme/colors";

export default {
  content: [
    "./app/**/{**,.client,.server}/**/*.{js,jsx,ts,tsx}",
    "./components/**/{**,.client,.server}/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        transparent: "transparent",
        current: "currentColor",
        ...textColors,
      },
      backgroundColor: {
        transparent: "transparent",
        current: "currentColor",
        ...surfaceColors,
        ...actionColors,
      },
      borderColor: {
        transparent: "transparent",
        current: "currentColor",
        ...borderColors,
      },
      outlineColor: {
        ...borderColors,
      },
      keyframes: {
        largeSpeaking: {
          "0%": { transform: "translateX(-50%) translateY(0%) scale(1)" },
          "25%": { transform: "translateX(-50%) translateY(-20%) scale(1)" },
          "50%": { transform: "translateX(-50%) translateY(0%) scale(1)" },
          "75%": { transform: "translateX(-50%) translateY(30%) scale(1)" },
          "100%": { transform: "translateX(-50%) translateY(0%) scale(1)" },
        },
        mediumSpeaking: {
          "0%": { transform: "translateX(55%) translateY(0%) scale(1)" },
          "25%": { transform: "translateX(55%) translateY(20%) scale(1)" },
          "50%": { transform: "translateX(55%) translateY(0%) scale(1)" },
          "75%": { transform: "translateX(55%) translateY(-30%) scale(1)" },
          "100%": { transform: "translateX(55%) translateY(0%) scale(1)" },
        },
        equalizerSmall: {
          "0%": { opacity: "0.35", height: "13px" },
          "100%": { opacity: "1", height: "28px" },
        },
        equalizerMedium: {
          "0%": { opacity: "0.35", height: "28px" },
          "100%": { opacity: "1", height: "40px" },
        },
        equalizerLarge: {
          "0%": { opacity: "0.35", height: "46px" },
          "100%": { opacity: "1", height: "78px" },
        },
        listening: {
          "0%": {
            opacity: "0.7",
            height: "48px",
          },
          "100%": { opacity: "0.7", height: "52px" },
        },
      },
      animation: {
        equalizerSmall: "equalizerSmall 100ms linear infinite alternate",
        equalizerMedium: "equalizerMedium 100ms linear infinite alternate",
        equalizerLarge: "equalizerLarge 100ms linear infinite alternate",
        listening: "listening 800ms linear infinite alternate",
        largeSpeaking: "largeSpeaking 75ms linear infinite",
        mediumSpeaking: "mediumSpeaking 750ms linear infinite",
      },
    },
    borderRadius: {
      DEFAULT: "4px",
      "2xs": "2px",
      xs: "4px",
      sm: "8px",
      md: "12px",
      lg: "16px",
      xl: "24px",
      "2xl": "32px",
      none: "0px",
      full: "999px",
    },
    boxShadow: {
      sm: "0px 6px 2px 0px rgba(0, 0, 0, 0.00), 0px 4px 2px 0px rgba(0, 0, 0, 0.01), 0px 2px 1px 0px rgba(0, 0, 0, 0.02), 0px 1px 1px 0px rgba(0, 0, 0, 0.03), 0px 0px 1px 0px rgba(0, 0, 0, 0.04)",
      md: "0px 29px 8px 0px rgba(0, 0, 0, 0.00), 0px 19px 8px 0px rgba(0, 0, 0, 0.00), 0px 11px 6px 0px rgba(0, 0, 0, 0.01), 0px 5px 5px 0px rgba(0, 0, 0, 0.02), 0px 1px 3px 0px rgba(0, 0, 0, 0.02)",
      lg: "0px 70px 20px 0px rgba(0, 0, 0, 0.00), 0px 45px 18px 0px rgba(0, 0, 0, 0.01), 0px 25px 15px 0px rgba(0, 0, 0, 0.02), 0px 11px 11px 0px rgba(0, 0, 0, 0.03), 0px 3px 6px 0px rgba(0, 0, 0, 0.04)",
      none: "0 0 rgba(0, 0, 0, 0.00)",
    },
    screens: {
      sm: "640px",
      // => @media (min-width: 640px) { ... }

      md: "768px",
      // => @media (min-width: 768px) { ... }

      lg: "1024px",
      // => @media (min-width: 1024px) { ... }

      xl: "1280px",
      // => @media (min-width: 1280px) { ... }

      "2xl": "1536px",
      // => @media (min-width: 1536px) { ... }
    },
  },
  plugins: [],
} satisfies Config;
