"use client";

import { useState } from "react";
import type { AIDetectionReport } from "@/lib/ai-detection";

const LEVEL_STYLE = {
  low: { ring: "stroke-emerald-400", text: "text-emerald-200", chip: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200", label: "Низкая" },
  medium: { ring: "stroke-amber-400", text: "text-amber-200", chip: "border-amber-400/30 bg-amber-400/10 text-amber-200", label: "Средняя" },
  high: { ring: "stroke-rose-400", text: "text-rose-200", chip: "border-rose-400/30 bg-rose-500/10 text-rose-200", label: "Высокая" },
} as const;

/** Карточка «Написано нейросетью?» — стилометрическая оценка + мнение LLM. */
export function AIDetectionCard({ report }: { report: AIDetectionReport }) {
  const [open, setOpen] = useState(false);
  const style = LEVEL_STYLE[report.level];
  const r = 26;
  const c = 2 * Math.PI * r;
  const dash = (report.probability / 100) * c;
  const pro = report.signals.filter((s) => s.weight > 0);
  const con = report.signals.filter((s) => s.weight < 0);

  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-100">Написано нейросетью?</h3>
          <p className="mt-1 text-xs text-slate-500">
            стилометрия кода{report.llmProbability !== null ? " + мнение ИИ-ревьюера" : ""} · вероятностная оценка, не вердикт
          </p>
          <p className="mt-3 text-xs leading-relaxed text-slate-300">{report.summary}</p>
          <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
            <span className={`rounded-md border px-2 py-0.5 ${style.chip}`}>{style.label} вероятность</span>
            <span className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-0.5 font-mono text-slate-300">
              эвристика {report.heuristicProbability}%
            </span>
            {report.llmProbability !== null && (
              <span className="rounded-md border border-violet-ray/25 bg-violet-ray/10 px-2 py-0.5 font-mono text-violet-200">
                LLM {report.llmProbability}%
              </span>
            )}
          </div>
        </div>

        <div className="relative grid h-[72px] w-[72px] shrink-0 place-items-center">
          <svg viewBox="0 0 64 64" className="h-[72px] w-[72px] -rotate-90">
            <circle cx="32" cy="32" r={r} fill="none" strokeWidth="5" className="stroke-white/10" />
            <circle
              cx="32"
              cy="32"
              r={r}
              fill="none"
              strokeWidth="5"
              strokeLinecap="round"
              strokeDasharray={`${dash} ${c - dash}`}
              className={`${style.ring} transition-[stroke-dasharray] duration-700`}
            />
          </svg>
          <span className={`absolute font-mono text-sm font-semibold ${style.text}`}>{report.probability}%</span>
        </div>
      </div>

      {report.signals.length > 0 && (
        <>
          <button
            onClick={() => setOpen((v) => !v)}
            className="mt-4 flex w-full items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-slate-300 transition hover:bg-white/[0.06]"
          >
            <span>
              Признаки: <span className="text-rose-200">{pro.length} за ИИ</span> ·{" "}
              <span className="text-emerald-200">{con.length} за человека</span>
            </span>
            <span className="text-slate-500">{open ? "свернуть ▲" : "показать ▼"}</span>
          </button>

          {open && (
            <ul className="mt-2 divide-y divide-white/[0.05] rounded-lg border border-white/[0.06]">
              {report.signals.map((s) => (
                <li key={s.id} className="flex items-start gap-3 px-3 py-2">
                  <span
                    className={`mt-0.5 w-10 shrink-0 rounded px-1 text-center font-mono text-[10px] ${
                      s.weight > 0 ? "bg-rose-500/15 text-rose-200" : "bg-emerald-400/15 text-emerald-200"
                    }`}
                  >
                    {s.weight > 0 ? "+" : ""}
                    {s.weight}
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs text-slate-200">{s.label}</p>
                    <p className="mt-0.5 break-words text-[11px] leading-relaxed text-slate-500">{s.detail}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {report.llmReasoning && (
        <p className="mt-3 rounded-lg border border-violet-ray/20 bg-violet-ray/[0.06] px-3 py-2 text-[11px] leading-relaxed text-slate-300">
          <span className="text-violet-200">ИИ-ревьюер:</span> {report.llmReasoning}
        </p>
      )}

      {report.questions.length > 0 && (
        <div className="mt-4">
          <h4 className="font-mono text-[10px] uppercase tracking-[0.18em] text-ray-300">Вопросы для устной защиты</h4>
          <ol className="mt-2 list-decimal space-y-1 pl-4 text-xs leading-relaxed text-slate-400">
            {report.questions.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
