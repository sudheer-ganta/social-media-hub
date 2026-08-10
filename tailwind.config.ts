import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    container: {
      center: true,
      padding: "1.5rem",
      screens: { "2xl": "1440px" },
    },
    extend: {
      fontFamily: {
        // One modern grotesque doing two jobs — hierarchy comes from weight,
        // size and tracking rather than from a second personality.
        sans: ["Instrument Sans", "system-ui", "-apple-system", "sans-serif"],
        display: ["Instrument Sans", "system-ui", "sans-serif"],
        // The single serif in the product: the Today lead headline, nowhere else.
        lead: ["Instrument Serif", "Georgia", "serif"],
        // Metadata: timestamps, counts, network names, publishing states.
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        info: {
          DEFAULT: "hsl(var(--info))",
          foreground: "hsl(var(--info-foreground))",
        },
        // Network identity — badges, rails and chart series only.
        platform: {
          instagram: "hsl(var(--platform-instagram))",
          linkedin: "hsl(var(--platform-linkedin))",
          facebook: "hsl(var(--platform-facebook))",
          x: "hsl(var(--platform-x))",
          youtube: "hsl(var(--platform-youtube))",
          threads: "hsl(var(--platform-threads))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 4px)",
        sm: "calc(var(--radius) - 8px)",
      },
      boxShadow: {
        // Warm, tight shadows — paper lifting off paper, not a neon glow.
        soft: "0 1px 2px -1px rgb(28 20 12 / 0.08), 0 2px 8px -4px rgb(28 20 12 / 0.08)",
        elevated:
          "0 2px 6px -2px rgb(28 20 12 / 0.10), 0 10px 28px -10px rgb(28 20 12 / 0.16)",
        glow: "0 0 0 1px hsl(var(--primary) / 0.25), 0 2px 10px -4px hsl(var(--primary) / 0.30)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        shimmer: "shimmer 2s linear infinite",
      },
    },
  },
  plugins: [animate],
} satisfies Config;
