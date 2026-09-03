import path from "node:path";
import { drizzle as drizzleNodePg, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

/**
 * Подключение к базе данных SyntaxRay.
 *
 * Двухрежимное:
 *  - задан `DATABASE_URL` → production-путь, PostgreSQL через node-postgres;
 *  - `DATABASE_URL` не задан → встроенная PGlite (PostgreSQL в Wasm),
 *    данные лежат в каталоге `.pglite/`, миграции из `drizzle/` применяются
 *    автоматически при первом обращении. Так платформа работает «из коробки»
 *    без внешних сервисов.
 *
 * Раньше здесь был throw на уровне модуля (`DATABASE_URL is required`) —
 * из-за этого падал `next build` и любой запрос без внешней БД. Теперь
 * клиент создаётся лениво, при первом вызове `getDb()`.
 */

export type Db = NodePgDatabase;

/** Создать клиент Drizzle поверх выбранного движка. */
async function createDb(): Promise<Db> {
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl) {
    const globalForDb = globalThis as typeof globalThis & { __syntaxRayPool?: Pool };
    globalForDb.__syntaxRayPool ??= new Pool({ connectionString: databaseUrl });
    return drizzleNodePg(globalForDb.__syntaxRayPool);
  }

  // Локальный отказоустойчивый режим: встроенный PostgreSQL (PGlite).
  // Импорт динамический, чтобы WASM-бандл не попадал в production-сборку,
  // где используется настоящий PostgreSQL.
  const [{ PGlite }, { drizzle: drizzlePgLite }, { migrate }] = await Promise.all([
    import("@electric-sql/pglite"),
    import("drizzle-orm/pglite"),
    import("drizzle-orm/pglite/migrator"),
  ]);

  const client = new PGlite(path.join(process.cwd(), ".pglite"));
  const embedded = drizzlePgLite(client);
  await migrate(embedded, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  return embedded as unknown as Db;
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
