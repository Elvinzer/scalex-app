import bundleAnalyzer from "@next/bundle-analyzer";
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

// No nonce-based script-src: that requires opting every route into dynamic
// rendering (a per-request nonce defeats static rendering), which would
// break app/(marketing)/'s static/ISR requirement. 'unsafe-inline' is the
// pragmatic trade-off — still blocks third-party script/frame injection,
// clickjacking, and MIME sniffing, which is what actually matters here.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: https://*.supabase.co`,
  "font-src 'self' data:",
  `connect-src 'self' https://*.posthog.com${supabaseOrigin ? ` ${supabaseOrigin}` : ""}`,
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
  },
  async headers() {
    return [
      {
        // Static assets are content-hashed by Next — safe to cache forever
        // and skip revalidation entirely.
        source: "/_next/static/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
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
    ];
  },
};

// Opt-in bundle composition report (docs/perf-audit.md's methodology) — a
// no-op unless ANALYZE=true, so normal `npm run build`/`npm run dev` are
// unaffected. Requires a webpack build (`next build`, no --turbopack) since
// the analyzer hooks into webpack's compilation, not Turbopack's:
// `ANALYZE=true npx next build`.
const withBundleAnalyzer = bundleAnalyzer({ enabled: process.env.ANALYZE === "true" });

export default withBundleAnalyzer(nextConfig);
