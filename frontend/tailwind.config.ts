import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
          faint: "hsl(var(--muted-foreground-faint))",
        },
        subtle: "hsl(var(--subtle))",
        card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },
        primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
        accent: { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))" },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar))",
          logoBar: "hsl(var(--sidebar-logo-bar))",
          foreground: "hsl(var(--sidebar-foreground))",
        },
        // 심사 신호 톤 — 각각 배경 페어 포함 (bg-good-bg 등으로 사용)
        good: { DEFAULT: "hsl(var(--good))", bg: "hsl(var(--good-bg))" },
        info: { DEFAULT: "hsl(var(--info))", bg: "hsl(var(--info-bg))" },
        warn: { DEFAULT: "hsl(var(--warn))", bg: "hsl(var(--warn-bg))" },
        bad: { DEFAULT: "hsl(var(--bad))", bg: "hsl(var(--bad-bg))" },
        orangeTone: { DEFAULT: "hsl(var(--orange-tone))", bg: "hsl(var(--orange-tone-bg))" },
        axis: {
          growth: "hsl(var(--axis-growth))",
          profit: "hsl(var(--axis-profit))",
          efficiency: "hsl(var(--axis-efficiency))",
          stability: "hsl(var(--axis-stability))",
        },
      },
      borderRadius: { xl: "1rem", lg: "0.75rem", md: "0.5rem", sm: "0.375rem" },
      fontFamily: { sans: ["var(--font-sans)", "system-ui", "sans-serif"] },
      boxShadow: {
        card: "0 1px 2px rgba(15,35,50,.06)",
        modal: "0 16px 40px rgba(15,35,50,.25)",
      },
    },
  },
  plugins: [],
};

export default config;
