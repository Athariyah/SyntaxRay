"use client";

import { useMemo, useState } from "react";

/**
 * ROI-калькулятор для лиц, принимающих решения: сколько часов и денег
 * кафедра экономит за семестр, отдав первичное ревью СинтексПруф.
 */
export function RoiCalculator() {
  const [students, setStudents] = useState(120);
  const [works, setWorks] = useState(4);
  const [minutes, setMinutes] = useState(25);

  const result = useMemo(() => {
    const totalReviews = students * works;
    const manualHours = (totalReviews * minutes) / 60;
    // Платформа забирает ~80% рутины: преподаватель проверяет только отчёт.
    const savedHours = manualHours * 0.8;
    const ratePerHour = 1500;
    return {
      totalReviews,
      manualHours: Math.round(manualHours),
      savedHours: Math.round(savedHours),
      savedMoney: Math.round(savedHours * ratePerHour),
    };
  }, [students, works, minutes]);

  const fmt = (n: number) => n.toLocaleString("ru-RU");

  return (
    <div className="glass-strong rounded-3xl p-8 sm:p-10">
      <h2 className="text-2xl font-semibold tracking-tight">Сколько вы сэкономите</h2>
      <p className="mt-2 max-w-xl text-sm text-slate-400">
        Подвигайте ползунки под вашу кафедру, курс или корпоративную академию.
      </p>

      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        <div className="space-y-6">
          <Slider label="Студентов" value={students} min={10} max={500} step={10} onChange={setStudents} />
          <Slider label="Работ на студента за семестр" value={works} min={1} max={12} step={1} onChange={setWorks} />
          <Slider label="Минут на ручное ревью" value={minutes} min={5} max={60} step={5} onChange={setMinutes} />
          <p className="text-xs text-slate-500">
            Расчёт: {fmt(result.totalReviews)} проверок × {minutes} мин = {fmt(result.manualHours)} ч
            ручной работы. СинтексПруф снимает ~80% рутины.
          </p>
        </div>

        <div className="grid content-center gap-4 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
          {[
            { v: `≈${fmt(result.savedHours)} ч`, k: "сэкономлено за семестр" },
            { v: `≈${fmt(result.savedMoney)} ₽`, k: "в деньгах (1 500 ₽/ч)" },
            { v: `${fmt(result.totalReviews)}`, k: "проверок без найма ассистентов" },
          ].map((s) => (
            <div key={s.k} className="rounded-2xl border border-ray-400/20 bg-ray-400/[0.06] p-5 text-center">
              <p className="font-mono text-2xl text-ray-200">{s.v}</p>
              <p className="mt-2 text-xs leading-snug text-slate-400">{s.k}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="flex items-center justify-between text-sm">
        <span className="text-slate-300">{label}</span>
        <span className="font-mono text-ray-300">{value}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 w-full accent-cyan-400"
      />
    </label>
  );
}
