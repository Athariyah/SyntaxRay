import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq, ne, sql } from "drizzle-orm";
import { getDb, isPersistentDatabaseConfigured } from "@/db";
import { findings as findingsTable, reviewFiles, submissions } from "@/db/schema";
import { ReviewContent, type ReviewContentData } from "@/components/review/review-content";
import { ReviewCacheFallback } from "@/components/review/review-cache-fallback";
import {
  type WorkspaceFinding,
} from "@/components/review/review-workspace";
import { similarityBetween, type SimilarPair } from "@/lib/similarity";
import type { ReviewReport, Severity } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ publicId: string }>;
}) {
  const { publicId } = await params;
  let submission: typeof submissions.$inferSelect | undefined;
  let files: Array<typeof reviewFiles.$inferSelect> = [];
  let issues: Array<typeof findingsTable.$inferSelect> = [];
  // Важно различать «заявки нет» (404) и «БД недоступна» (ошибка с retry):
  // раньше любая ошибка БД маскировалась под 404 и вводила в заблуждение.
  // notFound() бросает исключение, поэтому его вызываем СТРОГО вне try/catch —
  // иначе сигнал 404 будет проглочен и превратится в экран ошибки со статусом 200.
  let dbError = false;
  try {
    const db = await getDb();

    [submission] = await db
      .select()
      .from(submissions)
      .where(eq(submissions.publicId, publicId))
      .limit(1);

    if (submission) {
      [files, issues] = await Promise.all([
        db
          .select()
          .from(reviewFiles)
          .where(eq(reviewFiles.submissionId, submission.id))
          .orderBy(asc(reviewFiles.path)),
        db
          .select()
          .from(findingsTable)
          .where(eq(findingsTable.submissionId, submission.id))
          .orderBy(asc(findingsTable.line)),
      ]);
    }
  } catch (error) {
    console.error("[review] БД недоступна:", error);
    dbError = true;
  }

  if (dbError) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-24 text-center">
        <p className="font-mono text-sm text-amber-400/80">база данных недоступна</p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight">Не удалось загрузить ревью</h1>
        <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-slate-400">
          Хранилище временно не отвечает — ваша работа никуда не делась. Подождите несколько секунд
          и обновите страницу. Если ошибка повторяется, проверьте переменную{" "}
          <span className="font-mono text-slate-300">DATABASE_URL</span> в настройках деплоя.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href={`/review/${publicId}`}
            className="rounded-xl bg-gradient-to-r from-ray-400 to-violet-ray px-6 py-3 text-sm font-semibold text-ink-950 transition-transform hover:scale-[1.02]"
          >
            Попробовать снова
          </Link>
          <Link
            href="/dashboard"
            className="glass rounded-xl px-6 py-3 text-sm font-medium text-slate-200 transition-colors hover:border-ray-400/30 hover:text-white"
          >
            К дашборду
          </Link>
        </div>
      </div>
    );
  }

  // Постоянная БД не настроена → данные эфемерны и не разделяются между
  // API-роутом и страницей. Если ревью только что запущено в этой вкладке,
  // клиентский фолбэк покажет его из sessionStorage; честный 404 оставляем
  // только для постоянной БД (там отсутствие строки = реальное отсутствие).
  if (!submission) {
    if (isPersistentDatabaseConfigured()) notFound();
    return <ReviewCacheFallback publicId={publicId} />;
  }

  const report = (submission.report as unknown as ReviewReport | null) ?? null;

  // Похожие работы: сравниваем текущую с ≤15 последними завершёнными.
  let similarPairs: SimilarPair[] = [];
  try {
    const db = await getDb();
    const otherRows = await db
      .select({
        publicId: submissions.publicId,
        title: submissions.title,
        author: submissions.author,
        language: submissions.language,
        content: sql<string>`substring(${reviewFiles.content}, 1, 20000)`,
      })
      .from(submissions)
      .innerJoin(reviewFiles, eq(reviewFiles.submissionId, submissions.id))
      .where(and(eq(submissions.status, "completed"), ne(submissions.publicId, publicId)))
      .orderBy(desc(submissions.createdAt))
      .limit(120);
    const grouped = new Map<
      string,
      { publicId: string; title: string; author: string; language: string; contents: string[] }
    >();
    for (const r of otherRows) {
      if (grouped.size >= 15 && !grouped.has(r.publicId)) continue;
      const entry = grouped.get(r.publicId) ?? {
        publicId: r.publicId,
        title: r.title,
        author: r.author,
        language: r.language,
        contents: [],
      };
      if (entry.contents.length < 25 && r.content) entry.contents.push(r.content);
      grouped.set(r.publicId, entry);
    }
    const current = {
      language: submission.language,
      contents: files.map((f) => f.content),
    };
    similarPairs = Array.from(grouped.values())
      .map((o) => ({
        other: o,
        score: similarityBetween(current, { language: o.language, contents: o.contents }),
      }))
      .filter((x) => x.score >= 0.45)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((x) => ({
        aId: submission.publicId,
        aTitle: submission.title,
        aAuthor: submission.author,
        bId: x.other.publicId,
        bTitle: x.other.title,
        bAuthor: x.other.author,
        score: x.score,
      }));
  } catch (error) {
    console.error("[review] similarity недоступна:", error);
  }

  const workspaceFindings: WorkspaceFinding[] = issues.map((f) => ({
    id: f.id,
    filePath: f.filePath,
    line: f.line,
    endLine: f.endLine,
    severity: f.severity as Severity,
    category: f.category,
    title: f.title,
    message: f.message,
    suggestion: f.suggestion,
    origin: f.origin,
  }));

  const data: ReviewContentData = {
    publicId: submission.publicId,
    title: submission.title,
    author: submission.author,
    cohort: submission.cohort,
    language: submission.language,
    status: submission.status,
    score: submission.score,
    readability: submission.readability,
    architecture: submission.architecture,
    complexity: submission.complexity,
    verdict: submission.verdict,
    summary: submission.summary,
    engine: submission.engine,
    durationMs: submission.durationMs,
    createdAt: new Date(submission.createdAt).toISOString(),
    files: files.map((f) => ({
      id: f.id,
      path: f.path,
      language: f.language,
      content: f.content,
      lineCount: f.lineCount,
    })),
    findings: workspaceFindings,
    report,
  };

  return <ReviewContent data={data} similarPairs={similarPairs} />;
}

