import Link from "next/link";
import { similarityVerdict, type SimilarPair } from "@/lib/similarity";

/** Виджет «Возможные заимствования» — пары работ с подозрительно похожим кодом. */
export function SimilarityCard({ pairs }: { pairs: SimilarPair[] }) {
  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-100">Возможные заимствования</h3>
          <p className="mt-1 text-xs text-slate-500">
            антиплагиат-фильтр: шинглы кода → Жаккар · пары для ручной проверки
          </p>
        </div>
        <span className="shrink-0 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1 font-mono text-xs text-slate-300">
          {pairs.length} пар
        </span>
      </div>

      {pairs.length === 0 ? (
        <p className="mt-4 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.06] px-4 py-3 text-xs leading-relaxed text-emerald-200">
          Подозрительно похожих пар не найдено — работы выглядят самостоятельными.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-white/[0.05]">
          {pairs.map((p) => (
            <li key={`${p.aId}-${p.bId}`} className="py-3 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                <Link href={`/review/${p.aId}`} className="max-w-[40%] truncate text-ray-200 hover:underline" title={`${p.aTitle} — ${p.aAuthor}`}>
                  {p.aTitle}
                </Link>
                <span className="text-slate-600">⇄</span>
                <Link href={`/review/${p.bId}`} className="max-w-[40%] truncate text-ray-200 hover:underline" title={`${p.bTitle} — ${p.bAuthor}`}>
                  {p.bTitle}
                </Link>
                <span className="ml-auto rounded-md border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 font-mono text-[11px] text-amber-200">
                  {Math.round(p.score * 100)}% · {similarityVerdict(p.score)}
                </span>
              </div>
              <p className="mt-1 truncate text-[11px] text-slate-500">
                {p.aAuthor} · {p.bAuthor}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
