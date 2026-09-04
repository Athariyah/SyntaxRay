"use client";

import { languageLabel } from "@/lib/languages";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

export interface SubmissionRow {
  publicId: string;
  title: string;
  author: string;
  cohort: string;
  language: string;
  sourceKind: string;
  status: string;
  score: number | null;
  complexity: string | null;
  verdict: string | null;
  engine: string;
  createdAt: string;
  findingsCount: number;
  criticalCount: number;
}

const LANG_LABEL = (language: string): string =>
  language === "plaintext" ? "—" : languageLabel(language);

type SortKey = "date" | "score" | "findings";

const SORT_LABEL: Record<SortKey, string> = {
  date: "Сначала новые",
  score: "По баллу ↓",
  findings: "По замечаниям ↓",
};

function scoreTone(score: number | null): string {
  if (score === null) return "text-slate-500";
  if (score >= 85) return "text-emerald-300";
  if (score >= 70) return "text-ray-300";
  if (score >= 50) return "text-amber-300";
  return "text-rose-300";
}

export function SubmissionsTable({ rows }: { rows: SubmissionRow[] }) {
  const [query, setQuery] = useState("");
  const [lang, setLang] = useState("all");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState<SortKey>("date");
  const [busy, setBusy] = useState<string | null>(null);
  const router = useRouter();

  const availableLangs = useMemo(
    () => Array.from(new Set(rows.map((r) => r.language))).filter((l) => l && l !== "plaintext").sort(),
    [rows],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = rows.filter((r) => {
      const langOk = lang === "all" || r.language === lang;
      const statusOk = status === "all" || r.status === status;
      const qOk =
        !q ||
        r.title.toLowerCase().includes(q) ||
        r.author.toLowerCase().includes(q) ||
        r.cohort.toLowerCase().includes(q);
      return langOk && statusOk && qOk;
    });
    const sorted = list.slice();
    if (sort === "score") sorted.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
    else if (sort === "findings") sorted.sort((a, b) => b.findingsCount - a.findingsCount);
    else sorted.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
    return sorted;
  }, [rows, query, lang, status, sort]);

  function exportCsv() {
    const header = "Название;Автор;Группа;Язык;Статус;Балл;Сложность;Вердикт;Замечаний;Критических;Дата";
    const esc = (v: string | number | null) => {
      const s = v === null || v === undefined ? "" : String(v);
      return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = filtered.map((r) =>
      [
        esc(r.title),
        esc(r.author),
        esc(r.cohort),
        esc(r.language),
        esc(r.status),
        r.score ?? "",
        esc(r.complexity ?? ""),
        esc(r.verdict ?? ""),
        r.findingsCount,
        r.criticalCount,
        esc(new Date(r.createdAt).toLocaleString("ru-RU")),
      ].join(";"),
    );
    const blob = new Blob(["\uFEFF" + [header, ...lines].join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "syntaxray-vedomost.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function remove(publicId: string) {
    if (!window.confirm("Удалить это ревью вместе с файлами и замечаниями?")) return;
    setBusy(publicId);
    try {
      await fetch(`/api/submissions/${publicId}`, { method: "DELETE" });
    } finally {
      setBusy(null);
      router.refresh();
    }
  }

  return (
    <div className="glass overflow-hidden rounded-2xl">
      <div className="flex flex-col gap-3 border-b border-white/5 p-4">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск по названию, автору или группе…"
          className="w-full rounded-lg border border-white/10 bg-ink-900/60 px-3.5 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:border-ray-400/50 focus:outline-none"
        />
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 rounded-lg border border-white/10 bg-ink-900/60 p-1">
            {["all", ...availableLangs].map((value) => (
              <button
                key={value}
                onClick={() => setLang(value)}
                className={`rounded-md px-3 py-1.5 text-xs transition-colors ${
                  lang === value
                    ? "bg-ray-300 text-ink-950"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {value === "all" ? "Все языки" : LANG_LABEL(value)}
              </button>
            ))}
          </div>
          <div className="flex gap-1 rounded-lg border border-white/10 bg-ink-900/60 p-1">
            {[
              ["all", "Все статусы"],
              ["completed", "Готово"],
              ["failed", "Ошибки"],
              ["analyzing", "В работе"],
            ].map(([value, label]) => (
              <button
                key={value}
                onClick={() => setStatus(value)}
                className={`rounded-md px-3 py-1.5 text-xs transition-colors ${
                  status === value
                    ? "bg-ray-300 text-ink-950"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            aria-label="Сортировка"
            className="rounded-lg border border-white/10 bg-ink-900/60 px-3 py-2 text-xs text-slate-300 focus:border-ray-400/50 focus:outline-none"
          >
            {(Object.keys(SORT_LABEL) as SortKey[]).map((key) => (
              <option key={key} value={key}>
                {SORT_LABEL[key]}
              </option>
            ))}
          </select>
          <button
            onClick={exportCsv}
            disabled={filtered.length === 0}
            title="Скачать отфильтрованный список как CSV для Excel"
            className="rounded-lg border border-white/10 bg-ink-900/60 px-3 py-2 text-xs text-slate-300 transition-colors hover:border-ray-400/40 hover:text-white disabled:opacity-40"
          >
            ↓ CSV-ведомость
          </button>
          <span className="ml-auto font-mono text-[11px] text-slate-600">
            {filtered.length} / {rows.length}
          </span>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="px-6 py-16 text-center">
          <p className="text-slate-400">
            {rows.length === 0 ? "Пока нет ни одной проверки." : "Ничего не найдено — попробуйте смягчить фильтры."}
          </p>
          <Link
            href="/new"
            className="mt-4 inline-block rounded-lg border border-ray-400/30 bg-ray-400/10 px-4 py-2 text-sm text-ray-200 transition-colors hover:bg-ray-400/20"
          >
            Отправить проект на ревью
          </Link>
        </div>
      ) : (
        // Обычные div-строки без framer-motion: раньше каждая строка была
        // motion.div с layout-анимацией и staggered delay — при каждом
        // нажатии клавиши в поиске перезапускались десятки анимаций,
        // ввод лагал, а список «прыгал».
        <div className="divide-y divide-white/[0.05]">
          {filtered.map((row) => (
            <div
              key={row.publicId}
              className="group flex flex-col gap-3 px-5 py-4 transition-colors hover:bg-white/[0.03] sm:flex-row sm:items-center"
            >
              <div className="min-w-0 flex-1">
                <Link href={`/review/${row.publicId}`} className="block" prefetch={false}>
                  <p className="truncate font-medium text-slate-100 group-hover:text-ray-200">
                    {row.title}
                  </p>
                  <p className="mt-1 truncate text-xs text-slate-500">
                    {row.author}
                    {row.cohort ? ` · ${row.cohort}` : ""} ·{" "}
                    {new Date(row.createdAt).toLocaleString("ru-RU")} ·{" "}
                    <span className="font-mono">{row.engine}</span>
                  </p>
                </Link>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 font-mono text-slate-300">
                  {LANG_LABEL(row.language)}
                </span>
                <span className="rounded-md border border-violet-ray/25 bg-violet-ray/10 px-2 py-1 font-mono text-violet-200">
                  {row.complexity ?? "—"}
                </span>
                <span className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-slate-400">
                  {row.findingsCount} замеч.
                </span>
                {row.criticalCount > 0 && (
                  <span className="rounded-md border border-rose-400/30 bg-rose-400/10 px-2 py-1 text-rose-200">
                    {row.criticalCount} крит.
                  </span>
                )}
                <span className={`w-14 text-right font-mono text-lg ${scoreTone(row.score)}`}>
                  {row.status === "failed" ? "ERR" : (row.score ?? "…")}
                </span>
                <button
                  onClick={() => remove(row.publicId)}
                  disabled={busy === row.publicId}
                  className="rounded-md border border-white/10 px-2 py-1 text-slate-500 opacity-0 transition-all hover:border-rose-400/40 hover:text-rose-300 focus:opacity-100 group-hover:opacity-100 disabled:opacity-40"
                  aria-label={`Удалить ${row.title}`}
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
