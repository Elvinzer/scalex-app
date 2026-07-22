import type { NextConfig } from "next";
import path from "node:path";

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
};

export default nextConfig;
