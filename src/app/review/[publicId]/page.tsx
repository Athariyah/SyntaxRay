import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { findings as findingsTable, reviewFiles, submissions } from "@/db/schema";
import { Reveal } from "@/components/reveal";
import { ScoreRing } from "@/components/review/score-ring";
import {
  ReviewWorkspace,
  type WorkspaceFinding,
} from "@/components/review/review-workspace";
import type { ReviewReport, Severity } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ publicId: string }>;
}) {
  const { publicId } = await params;
  const db = await getDb();

  const [submission] = await db
    .select()
    .from(submissions)
    .where(eq(submissions.publicId, publicId))
    .limit(1);

  if (!submission) notFound();

  const [files, issues] = await Promise.all([
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

  const report = (submission.report as unknown as ReviewReport | null) ?? null;

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
