"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { runStaticAnalysis } from "@/lib/analyzer/static-engine";

const DEFAULT_CODE = `#include <stdio.h>
#include <stdlib.h>
#include <string.h>

int has_duplicates(int *data, int n) {
    for (int i = 0; i < n; i++) {
        for (int j = i + 1; j < n; j++) {
            if (data[i] == data[j])
                return 1;
        }
    }
    return 0;
}

int main(void) {
    int *buffer = malloc(1000 * sizeof(int));
    char name[16];
    gets(name);
    for (int i = 0; i < 1000; i++)
        buffer[i] = rand() % 5000;
    printf("%d\\n", has_duplicates(buffer, 1000));
    return 0;
}
`;

const PENALTY = { critical: 15, major: 7, minor: 2, info: 0.5 } as const;

function scoreColor(score: number): string {
  if (score >= 85) return "text-emerald-300";
  if (score >= 70) return "text-ray-300";
  if (score >= 50) return "text-amber-300";
  return "text-rose-300";
}

/**
 * Живое демо: детерминированный движок выполняется ПРЯМО В БРАУЗЕРЕ,
 * без сервера и регистрации. Инвестор правит код — оценка
 * пересчитывается мгновенно. Тот же код работает и на сервере.
 */
export function LiveDemo() {
  const [code, setCode] = useState(DEFAULT_CODE);

  const result = useMemo(() => {
    try {
      const sandbox = runStaticAnalysis([
        { path: "demo.c", language: "c", content: code },
      ]);
      const penalty = sandbox.findings.reduce((s, f) => s + PENALTY[f.severity], 0);
      const score = Math.max(5, Math.min(100, Math.round(100 - penalty)));
      return { ok: true as const, sandbox, score };
    } catch {
      return { ok: false as const };
    }
  }, [code]);

  return (
    <div className="glass-strong overflow-hidden rounded-3xl">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 p-5">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">
            Живое демо <span className="font-mono text-xs text-emerald-300">· без регистрации</span>
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Движок статического анализа работает прямо в вашем браузере. Измените код — оценка пересчитается.
          </p>
        </div>
        {result.ok && (
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className={`font-mono text-4xl ${scoreColor(result.score)}`}>{result.score}</p>
              <p className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
                {result.sandbox.complexity.estimate}
              </p>
            </div>
            <Link
              href="/new"
              className="rounded-xl bg-gradient-to-r from-ray-400 to-violet-ray px-5 py-2.5 text-sm font-semibold text-ink-950 transition-transform hover:scale-[1.02]"
            >
              Полное ИИ-ревью →
            </Link>
          </div>
        )}
      </div>

      <div className="grid lg:grid-cols-2">
        <textarea
          value={code}
          onChange={(e) => setCode(e.target.value)}
          spellCheck={false}
          rows={20}
          aria-label="Код для живого демо"
          className="min-h-[320px] w-full resize-y bg-ink-950/70 p-5 font-mono text-[12.5px] leading-relaxed text-slate-200 focus:outline-none"
        />
        <div className="max-h-[480px] overflow-auto border-t border-white/5 p-5 lg:border-l lg:border-t-0">
          {!result.ok ? (
            <p className="text-sm text-rose-300">Не удалось проанализировать код.</p>
          ) : result.sandbox.findings.length === 0 ? (
            <p className="text-sm text-emerald-300">Замечаний нет — образцовая работа.</p>
          ) : (
            <ul className="space-y-2.5">
              {result.sandbox.findings.slice(0, 12).map((f, i) => (
                <li key={`${f.line}-${i}`} className="rounded-xl border border-white/10 bg-ink-950/50 p-3">
                  <div className="flex items-center gap-2 text-xs">
                    <span
                      className={`rounded px-1.5 py-0.5 font-mono uppercase ${
                        f.severity === "critical"
                          ? "bg-rose-500/15 text-rose-200"
                          : f.severity === "major"
                            ? "bg-amber-500/15 text-amber-200"
                            : "bg-ray-400/15 text-ray-200"
                      }`}
                    >
                      {f.severity}
                    </span>
                    <span className="font-mono text-slate-500">стр. {f.line}</span>
                    <span className="truncate font-medium text-slate-200">{f.title}</span>
                  </div>
                  <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-slate-400">{f.message}</p>
                </li>
              ))}
            </ul>
          )}
          {result.ok && result.sandbox.findings.length > 12 && (
            <p className="mt-3 text-xs text-slate-500">
              …и ещё {result.sandbox.findings.length - 12}. Полный список с ИИ-разбором — в полном ревью.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
