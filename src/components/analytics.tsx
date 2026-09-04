/**
 * Аналитика группы для дашборда преподавателя.
 * Чистый SVG/CSS без внешних chart-библиотек — ноль веса в бандле.
 */

export interface AnalyticsData {
  /** 10 корзин баллов 0-9, 10-19, …, 90-100 */
  histogram: number[];
  severity: { critical: number; major: number; minor: number; info: number };
  categories: Array<{ key: string; label: string; count: number }>;
  /** Средний балл по дням: [{ day: "04.09", avg: 72 }] */
  trend: Array<{ day: string; avg: number; n: number }>;
}

const SEV_META = [
  { key: "critical", label: "Критические", color: "#ff5d7a" },
  { key: "major", label: "Серьёзные", color: "#ffb454" },
  { key: "minor", label: "Незначительные", color: "#38d3f5" },
  { key: "info", label: "Инфо", color: "#8b7bff" },
] as const;

export function Analytics({ data }: { data: AnalyticsData }) {
  const totalSev = SEV_META.reduce((s, m) => s + data.severity[m.key], 0);
  const maxBucket = Math.max(1, ...data.histogram);
  const maxCat = Math.max(1, ...data.categories.map((c) => c.count));

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {/* Распределение баллов */}
      <div className="glass rounded-2xl p-5">
        <h3 className="text-sm font-semibold text-slate-100">Распределение баллов</h3>
        <p className="mt-1 text-xs text-slate-500">сколько работ в каждом диапазоне</p>
        <div className="mt-4 flex h-28 items-end gap-1.5" role="img" aria-label="Гистограмма баллов">
          {data.histogram.map((n, i) => (
            <div key={i} className="group relative flex-1" title={`${i * 10}–${i * 10 + 9}: ${n}`}>
              <div
                className="w-full rounded-t bg-gradient-to-t from-ray-500/40 to-ray-300/90 transition-all group-hover:to-ray-300"
                style={{ height: `${Math.max(4, (n / maxBucket) * 100)}%` }}
              />
              <span className="pointer-events-none absolute -top-6 left-1/2 -translate-x-1/2 rounded bg-ink-800 px-1.5 py-0.5 font-mono text-[10px] text-slate-200 opacity-0 group-hover:opacity-100">
                {n}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-1.5 flex justify-between font-mono text-[10px] text-slate-600">
          <span>0</span>
          <span>50</span>
          <span>100</span>
        </div>
      </div>

      {/* Структура замечаний */}
      <div className="glass rounded-2xl p-5">
        <h3 className="text-sm font-semibold text-slate-100">Структура замечаний</h3>
        <p className="mt-1 text-xs text-slate-500">
          {totalSev === 0 ? "замечаний пока нет" : `всего ${totalSev}`}
        </p>
        {totalSev > 0 && (
          <div
            className="mt-4 flex h-3 w-full overflow-hidden rounded-full bg-white/5"
            role="img"
            aria-label="Доли замечаний по серьёзности"
          >
            {SEV_META.map((m) =>
              data.severity[m.key] > 0 ? (
                <div
                  key={m.key}
                  title={`${m.label}: ${data.severity[m.key]}`}
                  style={{
                    width: `${(data.severity[m.key] / totalSev) * 100}%`,
                    background: m.color,
                  }}
                />
              ) : null,
            )}
          </div>
        )}
        <ul className="mt-4 space-y-2">
          {SEV_META.map((m) => (
            <li key={m.key} className="flex items-center gap-2 text-xs">
              <span className="h-2 w-2 rounded-full" style={{ background: m.color }} />
              <span className="text-slate-400">{m.label}</span>
              <span className="ml-auto font-mono text-slate-200">{data.severity[m.key]}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Топ категорий + тренд */}
      <div className="glass rounded-2xl p-5">
        <h3 className="text-sm font-semibold text-slate-100">Частые проблемы группы</h3>
        <p className="mt-1 text-xs text-slate-500">куда направить следующее занятие</p>
        <ul className="mt-4 space-y-2.5">
          {data.categories.length === 0 && (
            <li className="text-xs text-slate-600">Пока недостаточно данных.</li>
          )}
          {data.categories.slice(0, 5).map((c) => (
            <li key={c.key}>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-300">{c.label}</span>
                <span className="font-mono text-slate-400">{c.count}</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/5">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-ray-400 to-violet-ray"
                  style={{ width: `${(c.count / maxCat) * 100}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
        {data.trend.length > 1 && (
          <div className="mt-5 border-t border-white/5 pt-4">
            <p className="text-[11px] uppercase tracking-wider text-slate-500">
              Средний балл по дням
            </p>
            <TrendSpark trend={data.trend} />
          </div>
        )}
      </div>
    </div>
  );
}

function TrendSpark({ trend }: { trend: AnalyticsData["trend"] }) {
  const W = 280;
  const H = 64;
  const PAD = 6;
  const xs = (i: number) => PAD + (i / Math.max(1, trend.length - 1)) * (W - PAD * 2);
  const ys = (v: number) => H - PAD - (Math.max(0, Math.min(100, v)) / 100) * (H - PAD * 2);
  const points = trend.map((t, i) => `${xs(i)},${ys(t.avg)}`).join(" ");
  const last = trend[trend.length - 1];
  const first = trend[0];
  const delta = last.avg - first.avg;
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 w-full" role="img" aria-label="Тренд среднего балла">
        <polyline
          points={points}
          fill="none"
          stroke="#38d3f5"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {trend.map((t, i) => (
          <circle key={t.day} cx={xs(i)} cy={ys(t.avg)} r="3" fill="#0b0f1a" stroke="#38d3f5" strokeWidth="2">
            <title>{`${t.day}: ${t.avg} (n=${t.n})`}</title>
          </circle>
        ))}
      </svg>
      <div className="flex items-center justify-between text-[11px] text-slate-500">
        <span className="font-mono">{trend[0].day} → {last.day}</span>
        <span className={delta >= 0 ? "text-emerald-300" : "text-rose-300"}>
          {delta >= 0 ? "▲" : "▼"} {Math.abs(delta)} пт
        </span>
      </div>
    </div>
  );
}
