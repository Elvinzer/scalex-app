import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// Design system "Hybride" — Inter everywhere (titles, body, numbers,
// sidebar, buttons, inputs), weights 400/500 only. Mapped in globals.css's
// @theme block onto --font-sans/--font-display/--font-mono so existing
// font-display/font-mono Tailwind classes resolve to Inter too, without
// touching every className across the app.
const inter = Inter({
  variable: "--font-inter",
  weight: ["400", "500"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Scale X: Diagnose and fix your business bottleneck",
  description:
    "Scale X diagnoses the #1 bottleneck holding back your info business and deploys an AI agent that fixes it.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} antialiased`}>{children}</body>
    </html>
  );
}
