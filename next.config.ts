import bundleAnalyzer from "@next/bundle-analyzer";
import createNextIntlPlugin from "next-intl/plugin";
import type { NextConfig } from "next";
import path from "node:path";

// Supabase project origin, derived from the same env var the client SDK
// uses, so CSP connect-src stays in sync without a second place to edit it.
const supabaseOrigin = (() => {
  try {
    return process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin : "";
  } catch {
    return "";
  }
})();

const posthogOrigin = (() => {
  try {
    return process.env.NEXT_PUBLIC_POSTHOG_HOST ? new URL(process.env.NEXT_PUBLIC_POSTHOG_HOST).origin : "";
  } catch {
    return "";
  }
})();

// React's development build uses eval() for debugging features (rebuilding
// callstacks across environments), and Turbopack's HMR client opens a
// websocket back to the dev server. Both are blocked by the production policy
// below, which is correct — so they are relaxed HERE AND ONLY HERE, gated on
// NODE_ENV. The header served by `next build` is unchanged: 'unsafe-eval'
// never reaches production, where React does not use eval() at all.
const isDev = process.env.NODE_ENV === "development";

// No nonce-based script-src: that requires opting every route into dynamic
// rendering (a per-request nonce defeats static rendering), which would
// break app/(marketing)/'s static/ISR requirement. 'unsafe-inline' is the
// pragmatic trade-off — still blocks third-party script/frame injection,
// clickjacking, and MIME sniffing, which is what actually matters here.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  // Broad https: (not scoped to Supabase) on purpose: post thumbnails are
  // short-lived signed URLs straight from Instagram's CDN
  // (app/(app)/acquisition/contenu/posts-table.tsx) and lever demo video
  // covers come from YouTube's oEmbed thumbnail_url (lib/levers/resources.ts)
  // — both rotate across edge subdomains with no fixed host to allowlist.
  // img-src is a low-risk directive to leave broad (no script execution),
  // unlike script-src/connect-src above which stay locked to 'self'.
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self' https://*.posthog.com${posthogOrigin ? ` ${posthogOrigin}` : ""}${supabaseOrigin ? ` ${supabaseOrigin}` : ""}${isDev ? " ws: wss:" : ""}`,
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "upgrade-insecure-requests",
].join("; ");

const nextConfig: NextConfig = {
  // Silences workspace-root inference: a stray package-lock.json in the
  // user's home directory otherwise gets picked up as a false monorepo root.
  turbopack: {
    root: path.join(__dirname),
  },
  images: {
    // Needed for next/image to load avatars from the Supabase Storage
    // "avatars" bucket (public URLs live on the project's *.supabase.co
    // domain) — adjust if the project uses a custom Supabase domain.
    remotePatterns: [{ protocol: "https", hostname: "*.supabase.co", pathname: "/storage/v1/object/public/**" }],
  },
  // Icon/animation packages imported by name across the app (sidebar, every
  // card, every chart) — without this Next bundles the whole package per
  // route instead of just the symbols actually used.
  experimental: {
    optimizePackageImports: ["lucide-react", "motion", "@tanstack/react-charts", "@tanstack/charts"],
    // Keep prefetched dynamic RSC payloads warm briefly. Without this,
    // loading.tsx boundaries are prefetched but discarded immediately, so
    // every click still waits for a server round-trip even after the user
    // has hovered the link. Business mutations already call revalidatePath
    // and revalidate the diagnostic tag, so this is a client navigation cache,
    // not a long-lived source-of-truth cache.
    staleTimes: {
      dynamic: 15,
      static: 60,
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
      {
        source: "/api/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store" },
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
        ],
      },
    ];
  },
};

// Opt-in bundle composition report (docs/perf-audit.md's methodology) — a
// no-op unless ANALYZE=true, so normal `npm run build`/`npm run dev` are
// unaffected. Requires a webpack build (`next build`, no --turbopack) since
// the analyzer hooks into webpack's compilation, not Turbopack's:
// `ANALYZE=true npx next build`.
const withBundleAnalyzer = bundleAnalyzer({ enabled: process.env.ANALYZE === "true" });

// Points next-intl at lib/i18n/request.ts. No locale routing plugin: the app
// resolves the locale from the user row / cookie, so every route keeps its
// existing path (see lib/i18n/locale.ts).
const withNextIntl = createNextIntlPlugin("./lib/i18n/request.ts");

export default withNextIntl(withBundleAnalyzer(nextConfig));
