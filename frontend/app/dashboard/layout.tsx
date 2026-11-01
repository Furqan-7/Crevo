import type { Metadata } from "next";
import type { CSSProperties, ReactNode } from "react";

// Layout for /dashboard. Inter and JetBrains Mono are self-hosted (loaded by
// the root layout's shared.css); the dashboard styles read them through these
// variables.
const fonts = { "--font-inter": '"Inter"', "--font-mono": '"JetBrains Mono"' } as CSSProperties;

export const metadata: Metadata = {
  title: { default: "Crevo", template: "%s — Crevo" },
  description: "Your daily creator briefing.",
  robots: { index: false },
};

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <div style={fonts}>{children}</div>;
}
