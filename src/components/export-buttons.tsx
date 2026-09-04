"use client";

import { useState } from "react";
import type { ReviewReport } from "@/lib/types";
import type { WorkspaceFinding } from "@/components/review/review-workspace";

function toMarkdown(params: {
  title: string;
  author: string;
  publicId: string;
  report: ReviewReport | null;
  findings: WorkspaceFinding[];
  score: number | null;
}): string {
  const { title, author, publicId, report, findings, score } = params;
  const lines = [
    `# Ревью: ${title}`,
    ``,
    `Автор: ${author} · Балл: ${score ?? "—"}/100 · Замечаний: ${findings.length}`,
    ``,
  ];
  if (report) {
    lines.push(`## Вердикт`, ``, `${report.verdict} — ${report.summary}`, ``);
    if (report.strengths.length > 0) {
      lines.push(`## Сильные стороны`, ``, ...report.strengths.map((s) => `- ${s}`), ``);
    }
    if (report.risks.length > 0) {
      lines.push(`## Риски`, ``, ...report.risks.map((s) => `- ${s}`), ``);
    }
    if (report.actionItems.length > 0) {
      lines.push(`## План правок`, ``, ...report.actionItems.map((s) => `- [ ] ${s}`), ``);
    }
    for (const section of report.sections) {
      lines.push(`## ${section.title}`, ``, section.body, ``);
    }
  }
  if (findings.length > 0) {
    lines.push(`## Замечания`, ``);
    for (const f of findings) {
      lines.push(`- **[${f.severity}]** \`${f.filePath}:${f.line}\` — ${f.title}`);
      if (f.suggestion) lines.push(`  Исправление: ${f.suggestion}`);
    }
    lines.push(``);
  }
  lines.push(`_Сгенерировано SyntaxRay · /review/${publicId}_`);
  return lines.join("\n");
}

/** Экспорт ревью: Markdown в буфер, файлы .md/.json, ссылка для ведомости. */
export function ExportButtons({
  title,
  author,
  publicId,
  score,
  report,
  findings,
}: {
  title: string;
  author: string;
  publicId: string;
  score: number | null;
  report: ReviewReport | null;
  findings: WorkspaceFinding[];
}) {
  const [copied, setCopied] = useState<string | null>(null);

  async function copy(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1800);
    } catch {
      setCopied("error");
      setTimeout(() => setCopied(null), 1800);
    }
  }

  function download(filename: string, text: string, mime: string) {
    const blob = new Blob([text], { type: `${mime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  const md = () => toMarkdown({ title, author, publicId, report, findings, score });
  const link = () => `${window.location.origin}/review/${publicId}`;
  // Однострочный вердикт для вставки в ведомость / LMS.
  const verdictLine = () =>
    `${author} — ${title}: ${score ?? "—"}/100 (${report?.verdict ?? "—"}), замечаний ${findings.length}, критических ${findings.filter((f) => f.severity === "critical").length}. ${link()}`;

  const btn =
    "rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-slate-300 transition-colors hover:border-ray-400/40 hover:text-white";

  return (
    <div className="flex flex-wrap gap-2">
      <button className={btn} onClick={() => copy(md(), "md")}>
        {copied === "md" ? "✓ Скопировано" : "⧉ Markdown-отчёт"}
      </button>
      <button className={btn} onClick={() => copy(verdictLine(), "verdict")}>
        {copied === "verdict" ? "✓ Скопировано" : "⧉ Строка для ведомости"}
      </button>
      <button className={btn} onClick={() => copy(link(), "link")}>
        {copied === "link" ? "✓ Скопировано" : "🔗 Ссылка на ревью"}
      </button>
      <button
        className={btn}
        onClick={() => download(`review-${publicId}.md`, md(), "text/markdown")}
      >
        ↓ Скачать .md
      </button>
      <button
        className={btn}
        onClick={() =>
          download(
            `review-${publicId}.json`,
            JSON.stringify({ title, author, publicId, score, report, findings }, null, 2),
            "application/json",
          )
        }
      >
        ↓ Скачать .json
      </button>
      {copied === "error" && (
        <span className="text-xs text-rose-300">Не удалось скопировать — разрешите доступ к буферу</span>
      )}
    </div>
  );
}
