"use client";

import { useEffect, useMemo, useState } from "react";
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

const SEVERITY_ORDER: Record<Severity, number> = { critical: 0, major: 1, minor: 2, info: 3 };

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

type Tab = "findings" | "report" | "sandbox";

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
  const [tab, setTab] = useState<Tab>("findings");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [fileQuery, setFileQuery] = useState("");
  const [onlyWithIssues, setOnlyWithIssues] = useState(false);
  const [findingQuery, setFindingQuery] = useState("");

  const activeFile = useMemo(
    () => files.find((f) => f.path === activePath) ?? files[0],
    [files, activePath],
  );

  // Подсчёт замечаний по файлам — один проход, мемоизировано
  // (раньше filter() вызывался на КАЖДУЮ строку списка файлов).
  const issuesByFile = useMemo(() => {
    const map = new Map<string, { total: number; critical: number }>();
    for (const f of findings) {
      const entry = map.get(f.filePath) ?? { total: 0, critical: 0 };
      entry.total += 1;
      if (f.severity === "critical") entry.critical += 1;
      map.set(f.filePath, entry);
    }
    return map;
  }, [findings]);

  const visibleFiles = useMemo(() => {
    const q = fileQuery.trim().toLowerCase();
    return files.filter((f) => {
      if (onlyWithIssues && (issuesByFile.get(f.path)?.total ?? 0) === 0) return false;
      if (q && !f.path.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [files, fileQuery, onlyWithIssues, issuesByFile]);

  const fileFindings = useMemo(
    () =>
      findings
        .filter((f) => f.filePath === activeFile?.path)
        .slice()
        .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.line - b.line),
    [findings, activeFile],
  );

  const visibleFindings = useMemo(() => {
    const q = findingQuery.trim().toLowerCase();
    return fileFindings.filter((f) => {
      if (severityFilter !== "all" && f.severity !== severityFilter) return false;
      if (
        q &&
        !`${f.title} ${f.message} ${CATEGORY_LABEL[f.category] ?? f.category}`.toLowerCase().includes(q)
      )
        return false;
      return true;
    });
  }, [fileFindings, severityFilter, findingQuery]);

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

  const severityCounts = useMemo(() => {
    const base: Record<Severity, number> = { critical: 0, major: 0, minor: 0, info: 0 };
    for (const f of fileFindings) base[f.severity] += 1;
    return base;
  }, [fileFindings]);

  // Горячие клавиши: 1/2/3 — вкладки панели, j/k — следующее/предыдущее
  // замечание, Esc — снять выделение строки.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }
      if (e.key === "1") setTab("findings");
      else if (e.key === "2") setTab("report");
      else if (e.key === "3") setTab("sandbox");
      else if (e.key === "Escape") {
        setActiveLine(null);
        setExpanded(null);
      } else if ((e.key === "j" || e.key === "k") && tab === "findings" && visibleFindings.length > 0) {
        e.preventDefault();
        const idx = visibleFindings.findIndex((f) => f.line === activeLine);
        const next =
          e.key === "j"
            ? visibleFindings[Math.min(idx + 1, visibleFindings.length - 1)] ?? visibleFindings[0]
            : visibleFindings[Math.max(idx - 1, 0)] ?? visibleFindings[0];
        if (next) {
          setActiveLine(next.line);
          setExpanded(next.id);
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tab, visibleFindings, activeLine]);

  if (!activeFile) {
    return <p className="glass rounded-2xl p-8 text-slate-400">Файлы не найдены.</p>;
  }

  function selectFile(path: string) {
    setActivePath(path);
    setActiveLine(null);
    setExpanded(null);
  }

  function selectFinding(f: WorkspaceFinding) {
    setActiveLine(f.line);
    setExpanded(expanded === f.id ? null : f.id);
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[240px_minmax(0,1fr)_420px]">
      {/* Дерево файлов */}
      <aside className="glass h-fit rounded-2xl p-3 xl:sticky xl:top-20">
        <p className="px-2 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">
          Файлы · {visibleFiles.length}/{files.length}
        </p>
        {files.length > 6 && (
          <input
            value={fileQuery}
            onChange={(e) => setFileQuery(e.target.value)}
            placeholder="Фильтр файлов…"
            className="mt-2 w-full rounded-lg border border-white/10 bg-ink-950/60 px-2.5 py-1.5 font-mono text-[11px] text-slate-200 placeholder:text-slate-600 focus:border-ray-400/50 focus:outline-none"
          />
        )}
        <label className="mt-2 flex cursor-pointer items-center gap-2 px-2 py-1 text-[11px] text-slate-500 hover:text-slate-300">
          <input
            type="checkbox"
            checked={onlyWithIssues}
            onChange={(e) => setOnlyWithIssues(e.target.checked)}
            className="accent-cyan-400"
          />
          Только с замечаниями
        </label>
        <ul className="mt-1 max-h-[50vh] space-y-0.5 overflow-auto">
          {visibleFiles.map((file) => {
            const stats = issuesByFile.get(file.path) ?? { total: 0, critical: 0 };
            const active = file.path === activePath;
            return (
              <li key={file.id}>
                <button
                  onClick={() => selectFile(file.path)}
                  title={file.path}
                  className={`group flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors ${
                    active ? "bg-ray-400/12 text-ray-100" : "text-slate-400 hover:bg-white/[0.04]"
                  }`}
                >
                  <span className="truncate font-mono">{file.path.split("/").pop()}</span>
                  <span className="ml-auto flex shrink-0 items-center gap-1">
                    {stats.critical > 0 && <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />}
                    <span className="text-[10px] text-slate-500">{stats.total}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        {visibleFiles.length === 0 && (
          <p className="px-2 py-4 text-[11px] text-slate-600">Файлы не найдены.</p>
        )}
      </aside>

      {/* Редактор */}
      <section className="glass overflow-hidden rounded-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-white/5 px-4 py-2.5">
          <span className="truncate font-mono text-xs text-slate-400" title={activeFile.path}>
            {activeFile.path}
          </span>
          <span className="shrink-0 font-mono text-[11px] text-slate-600">
            {activeFile.lineCount} строк · {activeFile.language}
            {markers.length > 0 && ` · ${markers.length} меток`}
          </span>
        </div>
        <div className="h-[calc(100vh-15rem)] min-h-[520px]">
          <CodeViewer
            path={activeFile.path}
            language={activeFile.language}
            content={activeFile.content}
            markers={markers}
            activeLine={activeLine}
          />
        </div>
      </section>

      {/* Панель ревью: вкладки переключаются мгновенно, без
          AnimatePresence mode="wait" (он ждал exit-анимацию и вкладки
          «залипали», а иногда контент не появлялся вовсе). */}
      <aside className="glass flex max-h-[calc(100vh-8rem)] min-h-[480px] flex-col overflow-hidden rounded-2xl xl:sticky xl:top-20">
        <div className="flex border-b border-white/5" role="tablist" aria-label="Панель ревью">
          {(
            [
              ["findings", `Замечания (${findings.length})`],
              ["report", "Отчёт"],
              ["sandbox", "Песочница"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`relative flex-1 px-3 py-3 text-xs transition-colors ${
                tab === id ? "text-slate-100" : "text-slate-500 hover:text-slate-300"
              }`}
            >
              {label}
              {tab === id && <span className="absolute inset-x-3 bottom-0 h-px bg-ray-300" />}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-auto">
          {tab === "findings" && (
            <div key={`findings-${activeFile.path}`} className="animate-page-in">
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
                    {s === "all" ? `Все (${fileFindings.length})` : `${SEVERITY_STYLE[s].label} (${severityCounts[s]})`}
                  </button>
                ))}
              </div>
              {fileFindings.length > 4 && (
                <div className="border-b border-white/5 p-3">
                  <input
                    value={findingQuery}
                    onChange={(e) => setFindingQuery(e.target.value)}
                    placeholder="Поиск по замечаниям…  (j/k — навигация)"
                    className="w-full rounded-lg border border-white/10 bg-ink-950/60 px-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-600 focus:border-ray-400/50 focus:outline-none"
                  />
                </div>
              )}

              {visibleFindings.length === 0 ? (
                <p className="p-6 text-sm text-slate-500">
                  В этом файле нет замечаний выбранного уровня. Отличная работа.
                </p>
              ) : (
                <ul className="divide-y divide-white/[0.05]">
                  {visibleFindings.map((f) => (
                    <li key={f.id} className={activeLine === f.line ? "bg-ray-400/[0.06]" : undefined}>
                      <button
                        onClick={() => selectFinding(f)}
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

                        {expanded === f.id && (
                          <div className="animate-page-in overflow-hidden">
                            <p className="mt-3 whitespace-pre-wrap text-xs leading-relaxed text-slate-400">
                              {f.message}
                            </p>
                            {f.suggestion && (
                              <p className="mt-3 rounded-lg border border-emerald-400/20 bg-emerald-400/[0.07] p-3 text-xs leading-relaxed text-emerald-200">
                                <span className="font-semibold">Как исправить: </span>
                                {f.suggestion}
                              </p>
                            )}
                          </div>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {tab === "report" && (
            <div key="report" className="animate-page-in space-y-5 p-4">
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
            </div>
          )}

          {tab === "sandbox" && (
            <div key="sandbox" className="animate-page-in space-y-4 p-4">
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
            </div>
          )}
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
