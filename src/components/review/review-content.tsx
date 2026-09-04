"use client";

import Link from "next/link";
import { Reveal } from "@/components/reveal";
import { ScoreRing } from "@/components/review/score-ring";
import {
  ReviewWorkspace,
  type WorkspaceFile,
  type WorkspaceFinding,
} from "@/components/review/review-workspace";
import { ExportButtons } from "@/components/export-buttons";
import { FixChecklist } from "@/components/fix-checklist";
import { SimilarityCard } from "@/components/similarity-card";
import { AIDetectionCard } from "@/components/ai-detection-card";
import type { SimilarPair } from "@/lib/similarity";
import type { ReviewReport } from "@/lib/types";

/**
 * Сериализуемая «снапшот» ревью — то, что нужно странице /review для отрисовки.
 * Используется и серверной страницей (из БД), и клиентским фолбэком
 * (из временного хранилища сессии, когда БД без DATABASE_URL эфемерна).
 */
export interface ReviewContentData {
  publicId: string;
  title: string;
  author: string;
  cohort: string;
  language: string;
  status: string;
  score: number | null;
  readability: number | null;
  architecture: number | null;
  complexity: string | null;
  verdict: string | null;
  summary: string | null;
  engine: string;
  durationMs: number | null;
  createdAt: string;
  files: WorkspaceFile[];
  findings: WorkspaceFinding[];
  report: ReviewReport | null;
}

/** Презентационная часть страницы ревью (общая для серверного и кэш-путей). */
export function ReviewContent({
  data,
  similarPairs,
}: {
  data: ReviewContentData;
  similarPairs: SimilarPair[];
}) {
  const criticals = data.findings.filter((f) => f.severity === "critical").length;

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-8 sm:px-6">
      <Reveal>
        <div className="glass-strong rounded-2xl p-6">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="min-w-0">
              <Link href="/dashboard" className="text-xs text-slate-500 transition-colors hover:text-ray-300">
                ← К дашборду
              </Link>
              <h1 className="mt-2 truncate text-2xl font-semibold tracking-tight">{data.title}</h1>
              <p className="mt-1.5 text-sm text-slate-500">
                {data.author}
                {data.cohort ? ` · ${data.cohort}` : ""} ·{" "}
                {new Date(data.createdAt).toLocaleString("ru-RU")} ·{" "}
                <span className="font-mono">{data.engine}</span>
                {data.durationMs ? ` · ${(data.durationMs / 1000).toFixed(1)} с` : ""}
              </p>

              <div className="mt-4 flex flex-wrap gap-2 text-xs">
                <Badge label="Вердикт" value={data.verdict ?? data.status} accent />
                <Badge label="Асимптотика" value={data.complexity ?? "—"} />
                <Badge label="Читаемость" value={`${data.readability ?? "—"}/100`} />
                <Badge label="Архитектура" value={`${data.architecture ?? "—"}/100`} />
                <Badge label="Замечаний" value={String(data.findings.length)} />
                {data.report?.aiDetection && (
                  <Badge
                    label="ИИ-генерация"
                    value={`${data.report.aiDetection.probability}%`}
                    danger={data.report.aiDetection.level === "high"}
                  />
                )}
                {criticals > 0 && <Badge label="Критических" value={String(criticals)} danger />}
              </div>
            </div>

            <ScoreRing score={data.score ?? 0} />
          </div>

          {data.status === "failed" && (
            <p className="mt-5 rounded-lg border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
              Анализ завершился с ошибкой: {data.summary}
            </p>
          )}
        </div>
      </Reveal>

      <div className="mt-5">
        <Reveal delay={0.08}>
          <ReviewWorkspace files={data.files} findings={data.findings} report={data.report} />
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
                  title={data.title}
                  author={data.author}
                  publicId={data.publicId}
                  score={data.score}
                  report={data.report}
                  findings={data.findings}
                />
              </div>
            </div>
          </Reveal>
          {data.report?.aiDetection && (
            <Reveal delay={0.11}>
              <AIDetectionCard report={data.report.aiDetection} />
            </Reveal>
          )}
          {similarPairs.length > 0 && (
            <Reveal delay={0.12}>
              <SimilarityCard pairs={similarPairs} />
            </Reveal>
          )}
        </div>
        <Reveal delay={0.12}>
          <FixChecklist
            publicId={data.publicId}
            actionItems={data.report?.actionItems ?? []}
            findings={data.findings}
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
