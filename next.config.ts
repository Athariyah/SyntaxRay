import type { NextConfig } from "next";

/**
 * Конфигурация Next.js для SyntaxRay.
 * Оптимизирована под развёртывание на Vercel (App Router, Node.js runtime).
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  // Monaco Editor тянет крупные воркеры — выносим их из серверного бандла.
  serverExternalPackages: ["monaco-editor"],

  experimental: {
    // Уменьшаем размер клиентского бандла Framer Motion.
    optimizePackageImports: ["framer-motion"],
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
