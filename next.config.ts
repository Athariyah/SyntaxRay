import type { NextConfig } from "next";

/**
 * Конфигурация Next.js для SyntaxRay.
 * Оптимизирована под развёртывание на Vercel (App Router, Node.js runtime).
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  // PGlite (Wasm) должен оставаться внешним — иначе сборщик пытается
  // заинлайнить .wasm и падает на Vercel (function size / ESM parsing).
  // Monaco Editor — клиентский пакет, на сервере не используется.
  serverExternalPackages: ["@electric-sql/pglite"],

  // Drizzle-миграции не нужны в runtime: схема создаётся через INIT_SCHEMA_SQL
  // (см. src/db/index.ts). Если решите отдавать SQL-файлы рантайму,
  // раскомментируйте и укажите узкий префикс, чтобы не раздувать каждый лямбда-бандл:
  // outputFileTracingIncludes: {
  //   "/api/**/*": ["./drizzle/**/*"],
  // },

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
