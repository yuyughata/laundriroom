import type { Config } from "tailwindcss";

/**
 * "Ink and Ivory" — the Fresco design language.
 * Tokens mirror the premium-theme section of the build plan so the app matches
 * the approved mockups. Swap these for the Phase 0 design-system values when
 * they are finalised.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: "#0F1B2D", // primary text, dark surfaces (vendor/admin chrome)
          soft: "#1C2A3E",
          muted: "#2B3A52",
        },
        ivory: {
          DEFAULT: "#F8F5EF", // app background
          deep: "#EFEAE0",
        },
        champagne: {
          DEFAULT: "#C6A664", // primary accent / CTAs on dark
          soft: "#D8BE86",
        },
        teal: {
          DEFAULT: "#5FB3A8", // success, "paid", "ready"
          soft: "#8ECbC2",
        },
        slate: {
          DEFAULT: "#5B6678", // secondary text, borders
          soft: "#8A93A1",
        },
        warn: {
          DEFAULT: "#C9793B", // "due", "pending", "not set up"
          soft: "#E0A878",
        },
        danger: {
          DEFAULT: "#B4463C", // failures, retired tags
        },
      },
      fontFamily: {
        // Fraunces for display/headings, Inter for UI text (loaded via next/font).
        display: ["var(--font-fraunces)", "Georgia", "serif"],
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        card: "16px",
        pill: "999px",
      },
      boxShadow: {
        card: "0 1px 2px rgba(15,27,45,0.04), 0 8px 24px rgba(15,27,45,0.06)",
        lift: "0 12px 40px rgba(15,27,45,0.12)",
      },
      maxWidth: {
        phone: "420px",
        tablet: "1024px",
      },
    },
  },
  plugins: [],
};

export default config;
