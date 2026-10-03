import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VolleyStars 2026 · Sviluppo",
  description: "Gestione torneo VolleyStars 2026",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it">
      <body className="antialiased">{children}</body>
    </html>
  );
}
