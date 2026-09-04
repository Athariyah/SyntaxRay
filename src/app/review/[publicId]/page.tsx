import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq, ne, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { findings as findingsTable, reviewFiles, submissions } from "@/db/schema";
import { Reveal } from "@/components/reveal";
import { ScoreRing } from "@/components/review/score-ring";
import {
  ReviewWorkspace,
  type WorkspaceFinding,
} from "@/components/review/review-workspace";
import { ExportButtons } from "@/components/export-buttons";
import { FixChecklist } from "@/components/fix-checklist";
import { SimilarityCard } from "@/components/similarity-card";
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

  if (!submission) notFound();

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

  const criticals = workspaceFindings.filter((f) => f.severity === "critical").length;

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-8 sm:px-6">
      <Reveal>
        <div className="glass-strong rounded-2xl p-6">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="min-w-0">
              <Link href="/dashboard" className="text-xs text-slate-500 transition-colors hover:text-ray-300">
                ← К дашборду
              </Link>
              <h1 className="mt-2 truncate text-2xl font-semibold tracking-tight">{submission.title}</h1>
              <p className="mt-1.5 text-sm text-slate-500">
                {submission.author}
                {submission.cohort ? ` · ${submission.cohort}` : ""} ·{" "}
                {new Date(submission.createdAt).toLocaleString("ru-RU")} ·{" "}
                <span className="font-mono">{submission.engine}</span>
                {submission.durationMs ? ` · ${(submission.durationMs / 1000).toFixed(1)} с` : ""}
              </p>

              <div className="mt-4 flex flex-wrap gap-2 text-xs">
                <Badge label="Вердикт" value={submission.verdict ?? submission.status} accent />
                <Badge label="Асимптотика" value={submission.complexity ?? "—"} />
                <Badge label="Читаемость" value={`${submission.readability ?? "—"}/100`} />
                <Badge label="Архитектура" value={`${submission.architecture ?? "—"}/100`} />
                <Badge label="Замечаний" value={String(workspaceFindings.length)} />
                {criticals > 0 && <Badge label="Критических" value={String(criticals)} danger />}
              </div>
            </div>

            <ScoreRing score={submission.score ?? 0} />
          </div>

          {submission.status === "failed" && (
            <p className="mt-5 rounded-lg border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
              Анализ завершился с ошибкой: {submission.summary}
            </p>
          )}
        </div>
      </Reveal>

      <div className="mt-5">
        <Reveal delay={0.08}>
          <ReviewWorkspace
            files={files.map((f) => ({
              id: f.id,
              path: f.path,
              language: f.language,
              content: f.content,
              lineCount: f.lineCount,
            }))}
            findings={workspaceFindings}
            report={report}
          />
        </Reveal>
      </div>

      <div className="mt-4 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-4">
          <Reveal delay={0.1}>
            <div className="glass rounded-2xl p-5">
              <h3 className="text-sm font-semibold text-slate-100">Поделиться и экспортировать</h3>
              <p className="mt-1 text-xs text-slate-500">
                Markdown для LMS, однострочный вердикт для ведомости, файлы для архива кафедры.
              </p>
              <div className="mt-3">
                <ExportButtons
                  title={submission.title}
                  author={submission.author}
                  publicId={submission.publicId}
                  score={submission.score}
                  report={report}
                  findings={workspaceFindings}
                />
              </div>
            </div>
          </Reveal>
          {similarPairs.length > 0 && (
            <Reveal delay={0.12}>
              <SimilarityCard pairs={similarPairs} />
            </Reveal>
          )}
        </div>
        <Reveal delay={0.12}>
          <FixChecklist
            publicId={submission.publicId}
            actionItems={report?.actionItems ?? []}
            findings={workspaceFindings}
          />
        </Reveal>
      </div>
    </div>
  );
}

function Badge({
  label,
  value,
  accent,
  danger,
}: {
  label: string;
  value: string;
  accent?: boolean;
  danger?: boolean;
}) {
  const tone = danger
    ? "border-rose-400/30 bg-rose-500/10 text-rose-200"
    : accent
      ? "border-ray-400/30 bg-ray-400/10 text-ray-200"
      : "border-white/10 bg-white/[0.04] text-slate-300";
  return (
    <span className={`rounded-lg border px-2.5 py-1.5 ${tone}`}>
      <span className="text-slate-500">{label}: </span>
      <span className="font-mono">{value}</span>
    </span>
  );
}
