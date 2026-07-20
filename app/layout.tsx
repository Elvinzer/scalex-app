import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

import { PostHogInit } from "@/components/posthog-init";

// Design system "Hybride" — Inter everywhere (titles, body, numbers,
// sidebar, buttons, inputs). Mapped in globals.css's @theme block onto
// --font-sans/--font-display/--font-mono so existing font-display/font-mono
// Tailwind classes resolve to Inter too, without touching every className
// across the app. 600/700 are loaded alongside 400/500 because the app
// uses font-bold/font-bold widely (headings, emphasis) — without the
// actual weight files, the browser fakes/synthesizes bold or falls back to
// a different font entirely, which is what read as "thin"/inconsistent.
const inter = Inter({
  variable: "--font-inter",
  weight: ["400", "500", "600", "700"],
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
      <body className={`${inter.variable} antialiased`}>
        <PostHogInit />
        {children}
      </body>
    </html>
  );
}
