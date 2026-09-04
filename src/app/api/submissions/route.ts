/**
 * POST /api/submissions — создать заявку и синхронно провести ревью.
 * GET  /api/submissions — список последних заявок для дашборда.
 */
import { NextResponse } from "next/server";
import { count, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { findings as findingsTable, reviewFiles, submissions } from "@/db/schema";
import { analyzeSubmission } from "@/lib/analyzer/pipeline";
import { aggregateLanguage, detectLanguage } from "@/lib/languages";
import { fetchRepoFiles } from "@/lib/repo";
import type { SourceFile } from "@/lib/types";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/jwt";
import { directConfigHasCredentials, parseDirectAIConfig } from "@/lib/ai/direct-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Лимит выполнения функции. На тарифе Hobby максимум — 60 c
// (значение 120 роняло деплой с ошибкой maxDuration).
// На Pro можно поднять до 300.
export const maxDuration = 60;

const MAX_FILES = 25;
const MAX_TOTAL_CHARS = 400_000;

function publicId(): string {
  return `sr_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

function dbUnavailable() {
  return NextResponse.json(
    { error: "База данных недоступна. Задайте DATABASE_URL в переменных окружения Vercel и примените миграции (npx drizzle-kit push)." },
    { status: 503 },
  );
}

export async function GET() {
  let db: Awaited<ReturnType<typeof getDb>>;
  try {
    db = await getDb();
  } catch (error) {
    console.error("[submissions] БД недоступна:", error);
    return dbUnavailable();
  }
  const rows = await db
    .select({
      publicId: submissions.publicId,
      title: submissions.title,
      author: submissions.author,
      cohort: submissions.cohort,
      language: submissions.language,
      sourceKind: submissions.sourceKind,
      status: submissions.status,
      score: submissions.score,
      complexity: submissions.complexity,
      verdict: submissions.verdict,
      engine: submissions.engine,
      createdAt: submissions.createdAt,
      // Агрегация через LEFT JOIN + GROUP BY по первичному ключу.
      // (Коррелированный подзапрос с ${submissions.id} внутри sql-поля
      // здесь не подходит: drizzle схлопывает квалификацию колонки до
      // "id", и ссылка уходит на findings.id вместо submissions.id.)
      findingsCount: count(findingsTable.id),
      criticalCount: sql<number>`count(*) filter (where ${findingsTable.severity} = 'critical')::int`,
    })
    .from(submissions)
    .leftJoin(findingsTable, eq(findingsTable.submissionId, submissions.id))
    .groupBy(submissions.id)
    .orderBy(desc(submissions.createdAt))
    .limit(50);

  return NextResponse.json({ submissions: rows });
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  let body: {
    title?: string;
    author?: string;
    cohort?: string;
    sourceKind?: string;
    repoUrl?: string;
    files?: Array<{ path?: string; content?: string }>;
    aiConfig?: unknown;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ожидается JSON-тело запроса" }, { status: 400 });
  }

  const sourceKind = body.sourceKind === "repo" || body.sourceKind === "archive" ? body.sourceKind : "paste";
  const aiConfig = parseDirectAIConfig(body.aiConfig);
  if (!directConfigHasCredentials(aiConfig)) {
    return NextResponse.json(
      {
        error:
          aiConfig?.provider === "yandexgpt"
            ? "Для YandexGPT укажите API-ключ и Folder ID (или полный modelUri gpt://...)."
            : "Для выбранной модели укажите API-ключ.",
      },
      { status: 400 },
    );
  }
  let files: SourceFile[] = [];

  try {
    if (sourceKind === "repo") {
      if (!body.repoUrl) {
        return NextResponse.json({ error: "Укажите ссылку на репозиторий" }, { status: 400 });
      }
      files = await fetchRepoFiles(body.repoUrl);
    } else {
      files = (body.files ?? [])
        .filter((f) => typeof f?.content === "string" && f.content.trim().length > 0)
        .slice(0, MAX_FILES)
        .map((f) => ({
          path: (f.path ?? "main.txt").replace(/^\/+/, "").slice(0, 300),
          language: detectLanguage(f.path ?? ""),
          content: f.content as string,
        }));
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Не удалось получить исходники" },
      { status: 400 },
    );
  }

  if (files.length === 0) {
    return NextResponse.json({ error: "Не найдено ни одного файла с кодом" }, { status: 400 });
  }

  const totalChars = files.reduce((sum, f) => sum + f.content.length, 0);
  if (totalChars > MAX_TOTAL_CHARS) {
    return NextResponse.json(
      { error: `Слишком большой объём кода (${totalChars} символов). Лимит — ${MAX_TOTAL_CHARS}.` },
      { status: 413 },
    );
  }

  const language = aggregateLanguage(files.map((f) => f.language));
  const title = (body.title?.trim() || files[0].path).slice(0, 200);
  const id = publicId();

  // Попытка связать заявку с авторизованным пользователем (если есть сессия)
  let userId: number | null = null;
  try {
    const cookieHeader = request.headers.get("cookie") ?? "";
    const token = cookieHeader
      .split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith(`${SESSION_COOKIE}=`))
      ?.split("=")[1];
    if (token) {
      const sess = verifySession(decodeURIComponent(token));
      if (sess?.userId) userId = sess.userId;
    }
  } catch {
    // игнорируем — анонимная отправка разрешена
  }

  let db: Awaited<ReturnType<typeof getDb>>;
  try {
    db = await getDb();
  } catch (error) {
    console.error("[submissions] БД недоступна:", error);
    return dbUnavailable();
  }

  const [created] = await db
    .insert(submissions)
    .values({
      publicId: id,
      title,
      author: (body.author?.trim() || "Аноним").slice(0, 120),
      cohort: (body.cohort?.trim() || "").slice(0, 120),
      language,
      sourceKind,
      repoUrl: body.repoUrl ?? null,
      status: "analyzing",
      userId,
    })
    .returning({ id: submissions.id });

  await db.insert(reviewFiles).values(
    files.map((f) => ({
      submissionId: created.id,
      path: f.path,
      language: f.language,
      content: f.content,
      lineCount: f.content.split("\n").length,
    })),
  );

  try {
    const report = await analyzeSubmission({ title, language, files, aiConfig });

    if (report.sandbox.findings.length > 0) {
      await db.insert(findingsTable).values(
        report.sandbox.findings.map((f) => ({
          submissionId: created.id,
          filePath: f.filePath,
          line: f.line,
          endLine: f.endLine ?? null,
          severity: f.severity,
          category: f.category,
          title: f.title,
          message: f.message,
          suggestion: f.suggestion ?? null,
          origin: f.origin,
        })),
      );
    }

    await db
      .update(submissions)
      .set({
        status: "completed",
        score: report.score,
        readability: report.readability,
        architecture: report.architecture,
        complexity: report.complexity,
        verdict: report.verdict,
        summary: report.summary,
        report: report as unknown as Record<string, unknown>,
        engine: report.engine.slice(0, 48),
        durationMs: Date.now() - startedAt,
        completedAt: new Date(),
      })
      .where(eq(submissions.id, created.id));

    return NextResponse.json({ publicId: id, score: report.score, verdict: report.verdict });
  } catch (error) {
    console.error("[submissions] analysis failed:", error);
    await db
      .update(submissions)
      .set({ status: "failed", summary: error instanceof Error ? error.message : "Ошибка анализа" })
      .where(eq(submissions.id, created.id));
    return NextResponse.json({ error: "Анализ завершился с ошибкой", publicId: id }, { status: 500 });
  }
}
