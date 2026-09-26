import type { NextConfig } from "next";

/**
 * Panda Wok — Cloudflare Pages friendly configuration.
 *
 * - standalone output: the server bundle is self-contained so Cloudflare Pages
 *   can run it through its Node.js runtime without needing node_modules on
 *   the edge; keeps the deployment portable across Pages/Fly/Railway etc..
 * - unoptimized images: no /_next/image optimizer dependency on the edge;
 *   images are served straight from Storage/URLs (already compressed on upload)..
 * - security headers are layered in /public/_headers for static assets and
 *   via middleware for dynamic pages..
 */
const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  /**
   * The ThreeUI effects are authored as standalone HTML documents and imported
   * with Vite's `?raw` suffix, which returns the file's text. Turbopack has no
   * built-in `?raw` query, so `raw-loader` supplies it. The `condition` scopes
   * the rule to that query, so every other `.html` import stays untouched.
   */
  turbopack: {
    rules: {
      "*.html": {
        condition: { query: /[?&]raw(?:&|$)/ },
        loaders: ["raw-loader"],
        as: "*.js",
      },
    },
  },
  images: {
    unoptimized: true,
    formats: ["image/avif", "image/webp"],
  },
  experimental: {
    optimizePackageImports: ["lucide-react", "motion"],
  },
  /**
   * /llms.txt is the AI-agent contract (AEO/GEO). App Router cannot host a
   * dot-named segment, so the handler lives at /llms-txt and is rewritten here
   * so agents always find the canonical path.
   */
  async rewrites() {
    return [{ source: "/llms.txt", destination: "/llms-txt" }];
  },
};

export default nextConfig;
