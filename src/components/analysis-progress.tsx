"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

const STAGES = [
  "Загрузка исходников в хранилище…",
  "Запуск изолированного контейнера (network=none)…",
  "Компиляция: gcc -Wall -Wextra -O2 / ruff…",
  "Статический анализ: cppcheck, clang-tidy, valgrind…",
  "Оценка асимптотической сложности…",
  "Семантическое ревью Gemini: архитектура и читаемость…",
  "Сборка отчёта и привязка замечаний к строкам…",
];

/** Skeleton-загрузчик с покадровой сменой стадий конвейера. */
export function AnalysisProgress() {
  const [stage, setStage] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setStage((s) => (s < STAGES.length - 1 ? s + 1 : s));
    }, 2200);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="glass-strong rounded-2xl p-6">
      <div className="flex items-center gap-3">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ray-400 opacity-70" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-ray-300" />
        </span>
        <p className="text-sm font-medium text-slate-200">Анализ выполняется</p>
      </div>

      <ul className="mt-5 space-y-2.5">
        {STAGES.map((text, i) => (
          <li key={text} className="flex items-start gap-3 text-sm">
            <span
              className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full transition-colors ${
                i < stage ? "bg-emerald-400" : i === stage ? "bg-ray-300" : "bg-slate-700"
              }`}
            />
            <motion.span
              animate={{ opacity: i <= stage ? 1 : 0.4 }}
              className={i === stage ? "text-slate-100" : "text-slate-500"}
            >
              {text}
            </motion.span>
          </li>
        ))}
      </ul>

      <div className="mt-6 space-y-3">
        <div className="skeleton h-3 w-3/4" />
        <div className="skeleton h-3 w-full" />
        <div className="skeleton h-3 w-5/6" />
        <div className="skeleton h-28 w-full" />
      </div>

      <p className="mt-5 text-xs text-slate-500">
        Обычно занимает 10–40 секунд в зависимости от объёма кода и загруженности модели.
      </p>
    </div>
  );
}
