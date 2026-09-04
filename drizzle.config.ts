import { defineConfig } from "drizzle-kit";

/**
 * Конфигурация Drizzle Kit для SyntaxRay.
 *
 * На Vercel DATABASE_URL приходит из Project Settings → Environment Variables
 * (Neon / Supabase / Vercel Postgres). Локально — из .env.local или fallback.
 * Использование process.env вместо хардкода позволяет `drizzle-kit push/generate`
 * работать без правки конфига и устраняет ворнинг Vercel о несоответствии URL.
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:5432/syntaxray",
  },
  verbose: true,
  strict: true,
});
