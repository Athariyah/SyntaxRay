"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CodeViewer, type EditorMarker } from "@/components/review/code-viewer";
import type { ReviewReport, Severity } from "@/lib/types";

export interface WorkspaceFile {
  id: number;
  path: string;
  language: string;
  content: string;
  lineCount: number;
}

export interface WorkspaceFinding {
  id: number;
  filePath: string;
  line: number;
  endLine: number | null;
  severity: Severity;
  category: string;
  title: string;
  message: string;
  suggestion: string | null;
  origin: string;
}

const SEVERITY_STYLE: Record<Severity, { dot: string; chip: string; label: string }> = {
  critical: { dot: "bg-rose-400", chip: "border-rose-400/30 bg-rose-500/10 text-rose-200", label: "Критично" },
  major: { dot: "bg-amber-400", chip: "border-amber-400/30 bg-amber-500/10 text-amber-200", label: "Серьёзно" },
  minor: { dot: "bg-ray-400", chip: "border-ray-400/30 bg-ray-400/10 text-ray-200", label: "Незначительно" },
  info: { dot: "bg-violet-ray", chip: "border-violet-ray/30 bg-violet-ray/10 text-violet-200", label: "Инфо" },
};

const CATEGORY_LABEL: Record<string, string> = {
  memory: "Память",
  pointers: "Указатели",
  complexity: "Сложность",
  architecture: "Архитектура",
  readability: "Читаемость",
  security: "Безопасность",
  style: "Стиль",
  correctness: "Корректность",
};

export function ReviewWorkspace({
  files,
  findings,
  report,
}: {
  files: WorkspaceFile[];
  findings: WorkspaceFinding[];
  report: ReviewReport | null;
}) {
  const [activePath, setActivePath] = useState(files[0]?.path ?? "");
  const [activeLine, setActiveLine] = useState<number | null>(null);
  const [severityFilter, setSeverityFilter] = useState<"all" | Severity>("all");
  const [tab, setTab] = useState<"findings" | "report" | "sandbox">("findings");
  const [expanded, setExpanded] = useState<number | null>(null);

  const activeFile = files.find((f) => f.path === activePath) ?? files[0];

  const fileFindings = useMemo(
    () => findings.filter((f) => f.filePath === activeFile?.path),
    [findings, activeFile],
  );

  const visibleFindings = useMemo(
    () =>
      (severityFilter === "all" ? fileFindings : fileFindings.filter((f) => f.severity === severityFilter))
        .slice()
        .sort((a, b) => a.line - b.line),
    [fileFindings, severityFilter],
  );

  const markers: EditorMarker[] = useMemo(
    () =>
      fileFindings.map((f) => ({
        id: f.id,
        line: f.line,
        endLine: f.endLine,
        severity: f.severity,
        title: f.title,
        message: f.message,
        suggestion: f.suggestion,
        origin: f.origin,
      })),
    [fileFindings],
  );

  const counts = useMemo(() => {
    const base: Record<string, number> = { critical: 0, major: 0, minor: 0, info: 0 };
    for (const f of findings) base[f.severity] = (base[f.severity] ?? 0) + 1;
    return base;
  }, [findings]);

  if (!activeFile) {
    return <p className="glass rounded-2xl p-8 text-slate-400">Файлы не найдены.</p>;
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[220px_minmax(0,1fr)_420px]">
      {/* Дерево файлов */}
      <aside className="glass h-fit rounded-2xl p-3 xl:sticky xl:top-20">
        <p className="px-2 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">
          Файлы · {files.length}
        </p>
        <ul className="mt-2 space-y-0.5">
          {files.map((file) => {
            const issues = findings.filter((f) => f.filePath === file.path);
            const critical = issues.filter((f) => f.severity === "critical").length;
            const active = file.path === activePath;
            return (
              <li key={file.id}>
                <button
                  onClick={() => {
                    setActivePath(file.path);
                    setActiveLine(null);
                  }}
                  className={`group flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors ${
                    active ? "bg-ray-400/12 text-ray-100" : "text-slate-400 hover:bg-white/[0.04]"
                  }`}
                >
                  <span className="truncate font-mono">{file.path.split("/").pop()}</span>
                  <span className="ml-auto flex items-center gap-1">
                    {critical > 0 && <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />}
                    <span className="text-[10px] text-slate-500">{issues.length}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      {/* Редактор */}
      <section className="glass overflow-hidden rounded-2xl">
        <div className="flex items-center justify-between border-b border-white/5 px-4 py-2.5">
          <span className="truncate font-mono text-xs text-slate-400">{activeFile.path}</span>
          <span className="shrink-0 font-mono text-[11px] text-slate-600">
            {activeFile.lineCount} строк · {activeFile.language}
          </span>
        </div>
        <div className="h-[calc(100vh-15rem)] min-h-[520px]">
          <CodeViewer
            path={activeFile.path}
            language={activeFile.language}
            content={activeFile.content}
            markers={markers}
            activeLine={activeLine}
            onSelectLine={() => undefined}
          />
        </div>
      </section>

      {/* Панель ревью */}
      <aside className="glass flex max-h-[calc(100vh-8rem)] flex-col overflow-hidden rounded-2xl xl:sticky xl:top-20">
        <div className="flex border-b border-white/5">
          {(
            [
              ["findings", `Замечания (${findings.length})`],
              ["report", "Отчёт"],
              ["sandbox", "Песочница"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`relative flex-1 px-3 py-3 text-xs transition-colors ${
                tab === id ? "text-slate-100" : "text-slate-500 hover:text-slate-300"
              }`}
            >
              {label}
              {tab === id && (
                <motion.span layoutId="panel-underline" className="absolute inset-x-3 bottom-0 h-px bg-ray-300" />
              )}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-auto">
          <AnimatePresence mode="wait">
            {tab === "findings" && (
              <motion.div
                key="findings"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <div className="flex flex-wrap gap-1.5 border-b border-white/5 p-3">
                  {(["all", "critical", "major", "minor", "info"] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => setSeverityFilter(s)}
                      className={`rounded-md border px-2 py-1 text-[11px] transition-colors ${
                        severityFilter === s
                          ? "border-ray-400/50 bg-ray-400/15 text-ray-100"
                          : "border-white/10 text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      {s === "all" ? `Все (${fileFindings.length})` : `${SEVERITY_STYLE[s].label} (${counts[s] ?? 0})`}
                    </button>
                  ))}
                </div>

                {visibleFindings.length === 0 ? (
                  <p className="p-6 text-sm text-slate-500">
                    В этом файле нет замечаний выбранного уровня. Отличная работа.
                  </p>
                ) : (
                  <ul className="divide-y divide-white/[0.05]">
                    {visibleFindings.map((f, i) => (
                      <motion.li
                        key={f.id}
                        initial={{ opacity: 0, x: 8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: Math.min(i * 0.02, 0.2), duration: 0.22 }}
                      >
                        <button
                          onClick={() => {
                            setActiveLine(f.line);
                            setExpanded(expanded === f.id ? null : f.id);
                          }}
                          className="w-full px-4 py-3 text-left transition-colors hover:bg-white/[0.03]"
                        >
                          <div className="flex items-start gap-2.5">
                            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${SEVERITY_STYLE[f.severity].dot}`} />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm leading-snug text-slate-100">{f.title}</p>
                              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px]">
                                <span className="rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 font-mono text-slate-400">
                                  стр. {f.line}
                                  {f.endLine && f.endLine !== f.line ? `–${f.endLine}` : ""}
                                </span>
                                <span className={`rounded border px-1.5 py-0.5 ${SEVERITY_STYLE[f.severity].chip}`}>
                                  {CATEGORY_LABEL[f.category] ?? f.category}
                                </span>
                                <span className="rounded border border-white/10 px-1.5 py-0.5 text-slate-500">
                                  {f.origin === "gemini" ? "Gemini" : f.origin === "sandbox" ? "Sandbox" : "Static"}
                                </span>
                              </div>
                            </div>
                          </div>

                          <AnimatePresence initial={false}>
                            {expanded === f.id && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                                className="overflow-hidden"
                              >
                                <p className="mt-3 whitespace-pre-wrap text-xs leading-relaxed text-slate-400">
                                  {f.message}
                                </p>
                                {f.suggestion && (
                                  <p className="mt-3 rounded-lg border border-emerald-400/20 bg-emerald-400/[0.07] p-3 text-xs leading-relaxed text-emerald-200">
                                    <span className="font-semibold">Как исправить: </span>
                                    {f.suggestion}
                                  </p>
                                )}
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </button>
                      </motion.li>
                    ))}
                  </ul>
                )}
              </motion.div>
            )}

            {tab === "report" && (
              <motion.div
                key="report"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="space-y-5 p-4"
              >
                {!report ? (
                  <div className="space-y-3">
                    <div className="skeleton h-4 w-2/3" />
                    <div className="skeleton h-3 w-full" />
                    <div className="skeleton h-3 w-5/6" />
                  </div>
                ) : (
                  <>
                    <p className="text-sm leading-relaxed text-slate-300">{report.summary}</p>

                    {report.strengths.length > 0 && (
                      <Block title="Сильные стороны" items={report.strengths} tone="emerald" />
                    )}
                    {report.risks.length > 0 && <Block title="Риски" items={report.risks} tone="rose" />}
                    {report.actionItems.length > 0 && (
                      <Block title="План правок" items={report.actionItems} tone="ray" />
                    )}

                    {report.sections.map((section) => (
                      <div key={section.title}>
                        <h4 className="font-mono text-[10px] uppercase tracking-[0.18em] text-ray-300">
                          {section.title}
                        </h4>
                        <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-slate-400">
                          {section.body}
                        </p>
                      </div>
                    ))}
                  </>
                )}
              </motion.div>
            )}

            {tab === "sandbox" && (
              <motion.div
                key="sandbox"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="space-y-4 p-4"
              >
                {report?.sandbox ? (
                  <>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {[
                        ["Файлов", report.sandbox.metrics.files],
                        ["Строк", report.sandbox.metrics.totalLines],
                        ["Комментарии", `${(report.sandbox.metrics.commentRatio * 100).toFixed(1)}%`],
                        ["Ср. длина функции", report.sandbox.metrics.avgFunctionLength],
                        ["Макс. вложенность", report.sandbox.metrics.maxNestingDepth],
                        ["Цикл. сложность", report.sandbox.metrics.cyclomaticComplexity],
                        ["Дубли блоков", report.sandbox.metrics.duplicateBlocks],
                        ["Асимптотика", report.sandbox.complexity.estimate],
                      ].map(([k, v]) => (
                        <div key={String(k)} className="rounded-lg border border-white/10 bg-ink-950/50 p-2.5">
                          <p className="text-[10px] uppercase tracking-wider text-slate-500">{k}</p>
                          <p className="mt-1 font-mono text-sm text-slate-200">{v}</p>
                        </div>
                      ))}
                    </div>

                    <div>
                      <h4 className="font-mono text-[10px] uppercase tracking-[0.18em] text-ray-300">
                        Инструменты
                      </h4>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {report.sandbox.toolchain.map((tool) => (
                          <span
                            key={tool}
                            className="rounded border border-white/10 bg-white/[0.04] px-2 py-1 font-mono text-[10px] text-slate-400"
                          >
                            {tool}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div>
                      <h4 className="font-mono text-[10px] uppercase tracking-[0.18em] text-ray-300">
                        Лог контейнера
                      </h4>
                      <pre className="mt-2 overflow-auto rounded-lg border border-white/10 bg-ink-950/70 p-3 font-mono text-[11px] leading-relaxed text-slate-400">
                        {report.sandbox.log.join("\n")}
                      </pre>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-slate-500">Данные песочницы недоступны.</p>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </aside>
    </div>
  );
}

function Block({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: "emerald" | "rose" | "ray";
}) {
  const toneClass =
    tone === "emerald"
      ? "border-emerald-400/20 bg-emerald-400/[0.06] text-emerald-100"
      : tone === "rose"
        ? "border-rose-400/20 bg-rose-400/[0.06] text-rose-100"
        : "border-ray-400/20 bg-ray-400/[0.06] text-ray-100";
  return (
    <div>
      <h4 className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">{title}</h4>
      <ul className={`mt-2 space-y-1.5 rounded-lg border p-3 text-xs leading-relaxed ${toneClass}`}>
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            <span className="opacity-60">•</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
