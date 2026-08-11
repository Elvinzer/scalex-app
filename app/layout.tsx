import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import "./globals.css";

import { LOCALE_HTML_LANG } from "@/lib/i18n/config";
import { getRequestLocale } from "@/lib/i18n/locale";
import { loadMessagesFor } from "@/lib/i18n/messages";
import { getPublicSiteUrl } from "@/lib/seo/site";

// Design system "Hybride" — Inter everywhere (titles, body, numbers,
// sidebar, buttons, inputs). Mapped in globals.css's @theme block onto
// --font-sans/--font-display/--font-mono so existing font-display/font-mono
// Tailwind classes resolve to Inter too, without touching every className
// across the app. 600/700 are loaded alongside 400/500 because the app
// uses font-bold widely (headings, emphasis) — without the actual weight
// files, the browser fakes/synthesizes bold or falls back to a different
// font entirely, which is what read as "thin"/inconsistent.
const inter = Inter({
  variable: "--font-inter",
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(getPublicSiteUrl()),
  title: "Scale X | Scaling coach for online businesses",
  description:
    "Scale X helps coaches and info businesses doing $10k to $100k per month find and fix the constraint slowing growth.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Resolved server-side, before the first byte: the page is rendered in the
  // right language from the start, so there is no flash of French to correct
  // in the browser (§A). Messages are provided by next-intl's request config
  // (lib/i18n/request.ts). The root provider carries only shared chrome
  // namespaces; authenticated and onboarding route groups add their own
  // message payloads below, avoiding the full catalog on marketing pages.
  const locale = await getRequestLocale();
  const messages = await loadMessagesFor(locale, ["common", "navigation"]);

  return (
    // inter.variable (which defines --font-inter) must live on <html>, not
    // <body>: globals.css's `html { font-family: var(--font-sans) }` rule
    // resolves --font-inter at the <html> element itself, and CSS custom
    // properties only inherit downward — defining it on <body> (a
    // descendant) left <html> unable to see it, so that rule silently fell
    // back to the browser's default serif, which every element without its
    // own explicit font utility class then inherited.
    <html lang={LOCALE_HTML_LANG[locale]} className={`${inter.variable} overflow-x-clip`}>
      <body className="antialiased overflow-x-clip">
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
