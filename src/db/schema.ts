/**
 * SyntaxRay — схема базы данных (Drizzle ORM / PostgreSQL).
 *
 * Модель данных описывает жизненный цикл ревью:
 *   submissions  — заявка на проверку (архив, репозиторий, вставленный код);
 *   review_files — исходные файлы, привязанные к заявке;
 *   findings     — замечания (строка + категория + серьёзность), которые
 *                  визуализируются в Monaco Editor как inline-маркеры.
 */
import {
  index,
  integer,
  jsonb,
  pgTable,
  real,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

/** Заявка на ревью. */
export const submissions = pgTable(
  "submissions",
  {
    id: serial("id").primaryKey(),
    /** Публичный идентификатор (используется в URL /review/[publicId]). */
    publicId: varchar("public_id", { length: 32 }).notNull().unique(),
    title: varchar("title", { length: 200 }).notNull(),
    author: varchar("author", { length: 120 }).notNull().default("Аноним"),
    /** Учебная группа / команда — удобно для преподавателя. */
    cohort: varchar("cohort", { length: 120 }).notNull().default(""),
    /** c | cpp | python | mixed */
    language: varchar("language", { length: 24 }).notNull().default("mixed"),
    /** paste | archive | repo */
    sourceKind: varchar("source_kind", { length: 24 }).notNull().default("paste"),
    repoUrl: text("repo_url"),
    /** queued | sandbox | analyzing | completed | failed */
    status: varchar("status", { length: 24 }).notNull().default("queued"),
    /** Итоговая академическая оценка 0..100 */
    score: integer("score"),
    /** Оценка читаемости 0..100 */
    readability: integer("readability"),
    /** Оценка архитектуры 0..100 */
    architecture: integer("architecture"),
    /** Худшая найденная асимптотика, напр. "O(N^2)" */
    complexity: varchar("complexity", { length: 48 }),
    verdict: varchar("verdict", { length: 48 }),
    summary: text("summary"),
    /** Полный отчёт: секции, метрики, лог песочницы */
    report: jsonb("report").$type<Record<string, unknown>>(),
    /** gemini-2.5-flash | heuristic-engine */
    engine: varchar("engine", { length: 48 }).notNull().default("heuristic-engine"),
    durationMs: real("duration_ms"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [index("submissions_created_at_idx").on(table.createdAt)],
);

/** Файл исходного кода внутри заявки. */
export const reviewFiles = pgTable(
  "review_files",
  {
    id: serial("id").primaryKey(),
    submissionId: integer("submission_id")
      .notNull()
      .references(() => submissions.id, { onDelete: "cascade" }),
    path: varchar("path", { length: 400 }).notNull(),
    language: varchar("language", { length: 24 }).notNull().default("plaintext"),
    content: text("content").notNull(),
    lineCount: integer("line_count").notNull().default(0),
  },
  (table) => [index("review_files_submission_idx").on(table.submissionId)],
);

/** Замечание, привязанное к строке кода. */
export const findings = pgTable(
  "findings",
  {
    id: serial("id").primaryKey(),
    submissionId: integer("submission_id")
      .notNull()
      .references(() => submissions.id, { onDelete: "cascade" }),
    filePath: varchar("file_path", { length: 400 }).notNull(),
    line: integer("line").notNull().default(1),
    endLine: integer("end_line"),
    /** critical | major | minor | info */
    severity: varchar("severity", { length: 16 }).notNull().default("minor"),
    /** memory | pointers | complexity | architecture | readability | security | style | correctness */
    category: varchar("category", { length: 32 }).notNull().default("style"),
    title: varchar("title", { length: 240 }).notNull(),
    message: text("message").notNull(),
    suggestion: text("suggestion"),
    /** heuristic | gemini | sandbox */
    origin: varchar("origin", { length: 24 }).notNull().default("heuristic"),
  },
  (table) => [index("findings_submission_idx").on(table.submissionId)],
);

export type Submission = typeof submissions.$inferSelect;
export type NewSubmission = typeof submissions.$inferInsert;
export type ReviewFile = typeof reviewFiles.$inferSelect;
export type NewReviewFile = typeof reviewFiles.$inferInsert;
export type Finding = typeof findings.$inferSelect;
export type NewFinding = typeof findings.$inferInsert;
