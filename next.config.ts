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
  images: {
    unoptimized: true,
    formats: ["image/avif", "image/webp"],
  },
  experimental: {
    optimizePackageImports: ["lucide-react", "motion"],
    /**
     * Menu photo uploads post the File to `uploadMenuImageAction`, and Next caps
     * server-action bodies at 1 MB by default. A phone photo is routinely 2-5 MB,
     * so every real upload was rejected by the framework before the action ran —
     * surfacing as a generic failure that looked like a crash. The limit is raised
     * to match the 8 MB the field and the `menu-images` bucket already advertise.
     */
    serverActions: {
      bodySizeLimit: "8mb",
    },
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
