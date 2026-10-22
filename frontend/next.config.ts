import type { NextConfig } from "next";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";
// The MCP app is mounted in FastAPI at /mcp (a standalone process is also
// available for the smoke client). The browser talks through this same-origin
// rewrite so the MCP client needs no CORS setup.
const MCP_URL = process.env.MCP_URL ?? "http://localhost:8000";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Keep the dev overlay from covering the mobile nav in the demo video.
  devIndicators: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // In production the backend is served alongside / behind the same origin;
  // in dev this rewrite keeps browser calls same-origin (no CORS friction).
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${BACKEND_URL}/api/:path*` },
      { source: "/health", destination: `${BACKEND_URL}/health` },
      { source: "/mcp", destination: `${MCP_URL}/mcp` },
      { source: "/mcp/:path*", destination: `${MCP_URL}/mcp/:path*` },
    ];
  },
};

export default nextConfig;
