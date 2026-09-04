import path from "node:path";
import { drizzle as drizzleNodePg, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

/**
 * Подключение к базе данных SyntaxRay.
 *
 * Двухрежимное:
 *  - задан `DATABASE_URL` → production-путь, PostgreSQL через node-postgres;
 *  - `DATABASE_URL` не задан → встроенная PGlite (PostgreSQL в Wasm),
 *    миграции из `drizzle/` применяются автоматически при первом обращении.
 *    Локально данные лежат в каталоге `.pglite/`.
 *
 * Важно для Vercel: файловая система серверных функций read-only,
 * писать можно только в `/tmp`, поэтому на Vercel данные PGlite живут
 * в `/tmp/.pglite` (эфемерно — переживают только тёплые вызовы),
 * а если и `/tmp` недоступен — используется in-memory база.
 * Для production с персистентностью задайте `DATABASE_URL`
 * (Neon / Supabase / Vercel Postgres) и примените миграции:
 * `npx drizzle-kit push`.
 *
 * Раньше здесь был throw на уровне модуля (`DATABASE_URL is required`) —
 * из-за этого падал `next build` и любой запрос без внешней БД. Теперь
 * клиент создаётся лениво, при первом вызове `getDb()`.
 */

export type Db = NodePgDatabase;

/** Создать клиент Drizzle поверх PostgreSQL по DATABASE_URL. */
function createPostgresDb(databaseUrl: string): Db {
  const globalForDb = globalThis as typeof globalThis & { __syntaxRayPool?: Pool };
  globalForDb.__syntaxRayPool ??= new Pool({ connectionString: databaseUrl });
  return drizzleNodePg(globalForDb.__syntaxRayPool);
}

/** Создать встроенную PGlite-базу (локальная разработка / fallback). */
async function createEmbeddedDb(): Promise<Db> {
  // Импорт динамический, чтобы WASM-бандл не попадал в production-сборку,
  // где используется настоящий PostgreSQL.
  const [{ PGlite }, { drizzle: drizzlePgLite }, { migrate }] = await Promise.all([
    import("@electric-sql/pglite"),
    import("drizzle-orm/pglite"),
    import("drizzle-orm/pglite/migrator"),
  ]);

  const migrationsFolder = path.join(process.cwd(), "drizzle");
  // На Vercel писать можно только в /tmp (остальная ФС read-only → EROFS).
  const candidates = process.env.VERCEL
    ? [path.join("/tmp", ".pglite")]
    : [path.join(process.cwd(), ".pglite"), path.join("/tmp", ".pglite")];

  for (const dataDir of candidates) {
    try {
      const embedded = drizzlePgLite(new PGlite(dataDir));
      await migrate(embedded, { migrationsFolder });
      return embedded as unknown as Db;
    } catch (error) {
      console.warn(`[db] PGlite недоступен в ${dataDir}, пробую дальше:`, error);
    }
  }

  // Последний шанс: in-memory база (данные живут до рестарта функции).
  const fallback = drizzlePgLite(new PGlite());
  await migrate(fallback, { migrationsFolder });
  return fallback as unknown as Db;
}

/** Создать клиент Drizzle поверх выбранного движка. */
async function createDb(): Promise<Db> {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (databaseUrl) {
    return createPostgresDb(databaseUrl);
  }
  return createEmbeddedDb();
}

const globalForDb = globalThis as typeof globalThis & {
  __syntaxRayDb?: Db;
  __syntaxRayDbPromise?: Promise<Db>;
};

/**
 * Получить готовый к запросам клиент БД (при необходимости создаёт его
 * и применяет миграции). Вызывайте один раз в начале обработчика:
 *
 *   const db = await getDb();
 */
export function getDb(): Promise<Db> {
  if (globalForDb.__syntaxRayDb) {
    return Promise.resolve(globalForDb.__syntaxRayDb);
  }
  globalForDb.__syntaxRayDbPromise ??= createDb().then((database) => {
    globalForDb.__syntaxRayDb = database;
    return database;
  });
  return globalForDb.__syntaxRayDbPromise;
}
