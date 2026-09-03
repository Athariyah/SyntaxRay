"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
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

const LANG_LABEL: Record<string, string> = {
  c: "C",
  cpp: "C++",
  python: "Python",
  mixed: "Mixed",
  plaintext: "—",
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
  const [busy, setBusy] = useState<string | null>(null);
  const router = useRouter();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      const langOk = lang === "all" || r.language === lang;
      const qOk =
        !q ||
        r.title.toLowerCase().includes(q) ||
        r.author.toLowerCase().includes(q) ||
        r.cohort.toLowerCase().includes(q);
      return langOk && qOk;
    });
  }, [rows, query, lang]);

  async function remove(publicId: string) {
    setBusy(publicId);
    await fetch(`/api/submissions/${publicId}`, { method: "DELETE" });
    setBusy(null);
    router.refresh();
  }

  return (
    <div className="glass overflow-hidden rounded-2xl">
      <div className="flex flex-col gap-3 border-b border-white/5 p-4 sm:flex-row sm:items-center">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск по названию, автору или группе…"
          className="w-full rounded-lg border border-white/10 bg-ink-900/60 px-3.5 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:border-ray-400/50 focus:outline-none"
        />
        <div className="flex gap-1 rounded-lg border border-white/10 bg-ink-900/60 p-1">
          {["all", "c", "cpp", "python"].map((value) => (
            <button
              key={value}
              onClick={() => setLang(value)}
              className={`relative rounded-md px-3 py-1.5 text-xs transition-colors ${
                lang === value ? "text-ink-950" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {lang === value && (
                <motion.span
                  layoutId="lang-pill"
                  className="absolute inset-0 rounded-md bg-ray-300"
                  transition={{ type: "spring", stiffness: 400, damping: 34 }}
                />
              )}
              <span className="relative">{value === "all" ? "Все" : LANG_LABEL[value]}</span>
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="px-6 py-16 text-center">
          <p className="text-slate-400">Пока нет ни одной проверки.</p>
          <Link
            href="/new"
            className="mt-4 inline-block rounded-lg border border-ray-400/30 bg-ray-400/10 px-4 py-2 text-sm text-ray-200 transition-colors hover:bg-ray-400/20"
          >
            Отправить первый проект
          </Link>
        </div>
      ) : (
        <div className="divide-y divide-white/[0.05]">
          <AnimatePresence initial={false}>
            {filtered.map((row, i) => (
              <motion.div
                key={row.publicId}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.28, delay: Math.min(i * 0.025, 0.25) }}
                className="group flex flex-col gap-3 px-5 py-4 transition-colors hover:bg-white/[0.03] sm:flex-row sm:items-center"
              >
                <div className="min-w-0 flex-1">
                  <Link href={`/review/${row.publicId}`} className="block">
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
                    {LANG_LABEL[row.language] ?? row.language}
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
                    className="rounded-md border border-white/10 px-2 py-1 text-slate-500 opacity-0 transition-all hover:border-rose-400/40 hover:text-rose-300 group-hover:opacity-100 disabled:opacity-40"
                    aria-label="Удалить"
                  >
                    ✕
                  </button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
