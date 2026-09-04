import path from "node:path";
import { drizzle as drizzleNodePg, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

/**
 * Подключение к базе данных SyntaxRay.
 *
 * Двухрежимное:
 *  - задан `DATABASE_URL` → production-путь, PostgreSQL (Neon / Supabase / Vercel Postgres);
 *  - `DATABASE_URL` не задан → встроенная PGlite (PostgreSQL в Wasm),
 *    таблицы инициализируются автоматически при первом обращении.
 *    Локально данные лежат в каталоге `.pglite/`.
 *
 * На Vercel: файловая система серверных функций read-only,
 * писать можно только в `/tmp`, поэтому на Vercel данные PGlite живут
 * в `/tmp/.pglite` (эфемерно — между тёплыми вызовами),
 * а при недоступности диска — используется in-memory база.
 * Для production с постоянным хранилищем задайте `DATABASE_URL`
 * в Project Settings → Environment Variables на Vercel.
 */

export type Db = NodePgDatabase;

const INIT_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS submissions (
  id serial PRIMARY KEY NOT NULL,
  public_id varchar(32) NOT NULL UNIQUE,
  title varchar(200) NOT NULL,
  author varchar(120) DEFAULT 'Аноним' NOT NULL,
  cohort varchar(120) DEFAULT '' NOT NULL,
  language varchar(24) DEFAULT 'mixed' NOT NULL,
  source_kind varchar(24) DEFAULT 'paste' NOT NULL,
  repo_url text,
  status varchar(24) DEFAULT 'queued' NOT NULL,
  score integer,
  readability integer,
  architecture integer,
  complexity varchar(48),
  verdict varchar(48),
  summary text,
  report jsonb,
  engine varchar(48) DEFAULT 'heuristic-engine' NOT NULL,
  duration_ms real,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  completed_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS review_files (
  id serial PRIMARY KEY NOT NULL,
  submission_id integer NOT NULL REFERENCES submissions(id) ON DELETE cascade,
  path varchar(400) NOT NULL,
  language varchar(24) DEFAULT 'plaintext' NOT NULL,
  content text NOT NULL,
  line_count integer DEFAULT 0 NOT NULL
);

CREATE TABLE IF NOT EXISTS findings (
  id serial PRIMARY KEY NOT NULL,
  submission_id integer NOT NULL REFERENCES submissions(id) ON DELETE cascade,
  file_path varchar(400) NOT NULL,
  line integer DEFAULT 1 NOT NULL,
  end_line integer,
  severity varchar(16) DEFAULT 'minor' NOT NULL,
  category varchar(32) DEFAULT 'style' NOT NULL,
  title varchar(240) NOT NULL,
  message text NOT NULL,
  suggestion text,
  origin varchar(24) DEFAULT 'heuristic' NOT NULL
);

CREATE INDEX IF NOT EXISTS findings_submission_idx ON findings(submission_id);
CREATE INDEX IF NOT EXISTS review_files_submission_idx ON review_files(submission_id);
CREATE INDEX IF NOT EXISTS submissions_created_at_idx ON submissions(created_at);
`;

function isLocalPostgres(url: string): boolean {
  return url.includes("localhost") || url.includes("127.0.0.1") || url.includes("sslmode=disable");
}

/** Создать клиент Drizzle поверх PostgreSQL по DATABASE_URL. */
async function createPostgresDb(databaseUrl: string): Promise<Db> {
  const globalForDb = globalThis as typeof globalThis & { __syntaxRayPool?: Pool };
  if (!globalForDb.__syntaxRayPool) {
    globalForDb.__syntaxRayPool = new Pool({
      connectionString: databaseUrl,
      ssl: isLocalPostgres(databaseUrl) ? undefined : { rejectUnauthorized: false },
      max: 10,
      connectionTimeoutMillis: 5000,
    });
  }

  const pool = globalForDb.__syntaxRayPool;
  try {
    await pool.query(INIT_SCHEMA_SQL);
  } catch (err) {
    console.warn("[db] Автоинициализация схемы PostgreSQL завершилась с предупреждением:", err);
  }

  return drizzleNodePg(pool);
}

/** Создать встроенную PGlite-базу (локальная разработка / fallback). */
async function createEmbeddedDb(): Promise<Db> {
  const [{ PGlite }, { drizzle: drizzlePgLite }] = await Promise.all([
    import("@electric-sql/pglite"),
    import("drizzle-orm/pglite"),
  ]);

  // На Vercel писать можно только в /tmp (остальная ФС read-only → EROFS).
  const candidates = process.env.VERCEL
    ? [path.join("/tmp", ".pglite")]
    : [path.join(process.cwd(), ".pglite"), path.join("/tmp", ".pglite")];

  for (const dataDir of candidates) {
    try {
      const pglite = new PGlite(dataDir);
      await pglite.exec(INIT_SCHEMA_SQL);
      return drizzlePgLite(pglite) as unknown as Db;
    } catch (error) {
      console.warn(`[db] PGlite недоступен в ${dataDir}, пробую дальше:`, error);
    }
  }

  // Последний шанс: in-memory база (данные живут до рестарта функции).
  const fallback = new PGlite();
  await fallback.exec(INIT_SCHEMA_SQL);
  return drizzlePgLite(fallback) as unknown as Db;
}

function resolveDatabaseUrl(): string | undefined {
  // Vercel Postgres может прокидывать POSTGRES_URL / POSTGRES_PRISMA_URL
  // вместо DATABASE_URL — поддерживаем все варианты, чтобы деплой не падал
  // с «База данных недоступна» при корректно подключённом Vercel Postgres.
  const candidates = [
    process.env.DATABASE_URL,
    process.env.POSTGRES_URL,
    process.env.POSTGRES_PRISMA_URL,
    process.env.POSTGRES_URL_NON_POOLING,
  ];
  for (const c of candidates) {
    const v = c?.trim();
    if (v) return v;
  }
  return undefined;
}

/** Создать клиент Drizzle поверх выбранного движка. */
async function createDb(): Promise<Db> {
  const databaseUrl = resolveDatabaseUrl();
  if (databaseUrl) {
    return createPostgresDb(databaseUrl);
  }
  // На Vercel без внешней БД предупреждаем явно — PGlite в /tmp эфемерен.
  if (process.env.VERCEL) {
    console.warn(
      "[db] DATABASE_URL/POSTGRES_URL не задан — используется эфемерная PGlite в /tmp. " +
        "Для продакшена задайте DATABASE_URL в Vercel Environment Variables.",
    );
  }
  return createEmbeddedDb();
}

const globalForDb = globalThis as typeof globalThis & {
  __syntaxRayDb?: Db;
  __syntaxRayDbPromise?: Promise<Db>;
};

/**
 * Получить готовый к запросам клиент БД (при необходимости создаёт его
 * и инициализирует схему).
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
