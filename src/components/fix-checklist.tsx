"use client";

import { useEffect, useMemo, useState } from "react";
import type { WorkspaceFinding } from "@/components/review/review-workspace";

interface Item {
  key: string;
  label: string;
  detail: string;
  severity: string;
}

/**
 * Интерактивный чек-лист «Готовность к пересдаче»: студент отмечает
 * исправленные пункты, прогресс хранится в localStorage. Геймификация,
 * которая доводит ревью до реального исправления кода.
 */
export function FixChecklist({
  publicId,
  actionItems,
  findings,
}: {
  publicId: string;
  actionItems: string[];
  findings: WorkspaceFinding[];
}) {
  const storageKey = `sr-checklist-${publicId}`;

  const items: Item[] = useMemo(() => {
    const list: Item[] = actionItems.slice(0, 8).map((label, i) => ({
      key: `action-${i}`,
      label,
      detail: "Из плана правок",
      severity: "minor",
    }));
    for (const f of findings) {
      if (f.severity !== "critical" && f.severity !== "major") continue;
      if (list.length >= 14) break;
      list.push({
        key: `finding-${f.id}`,
        label: f.title,
        detail: `${f.filePath}:${f.line}`,
        severity: f.severity,
      });
    }
    return list;
  }, [actionItems, findings]);

  // Начальное состояние лениво читаем из localStorage — без setState в эффекте.
  const [done, setDone] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(done));
    } catch {
      /* ignore */
    }
  }, [done, storageKey]);

  if (items.length === 0) return null;

  const doneCount = items.filter((i) => done[i.key]).length;
  const pct = Math.round((doneCount / items.length) * 100);

  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-100">Готовность к пересдаче</h3>
          <p className="mt-1 text-xs text-slate-500">
            {doneCount} из {items.length} · прогресс сохраняется в браузере
          </p>
        </div>
        <span className="font-mono text-2xl text-ray-300">{pct}%</span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/5">
        <div
          className="h-full rounded-full bg-gradient-to-r from-ray-400 to-emerald-400 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      {pct === 100 && (
        <p className="mt-3 rounded-lg border border-emerald-400/25 bg-emerald-400/10 px-3 py-2 text-xs text-emerald-200">
          Всё отмечено! Отправьте исправленный код как новое ревью, чтобы сравнить баллы.
        </p>
      )}
      <ul className="mt-3 space-y-1.5">
        {items.map((item) => {
          const checked = !!done[item.key];
          return (
            <li key={item.key}>
              <label
                className={`flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2 text-xs transition-colors ${
                  checked
                    ? "border-emerald-400/20 bg-emerald-400/[0.05] text-slate-500"
                    : "border-white/5 bg-white/[0.02] text-slate-300 hover:border-white/15"
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => setDone((d) => ({ ...d, [item.key]: !d[item.key] }))}
                  className="mt-0.5 accent-emerald-400"
                />
                <span className="min-w-0">
                  <span className={`block leading-snug ${checked ? "line-through" : ""}`}>
                    {item.label}
                  </span>
                  <span className="mt-0.5 block font-mono text-[10px] opacity-60">
                    {item.severity === "critical" ? "🔴 " : item.severity === "major" ? "🟠 " : ""}
                    {item.detail}
                  </span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
