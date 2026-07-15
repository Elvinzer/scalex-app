import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Silences workspace-root inference: a stray package-lock.json in the
  // user's home directory otherwise gets picked up as a false monorepo root.
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
