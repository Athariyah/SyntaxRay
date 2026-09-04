import Link from "next/link";
import { count, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { findings, reviewFiles, submissions } from "@/db/schema";
import { Reveal } from "@/components/reveal";
import { SubmissionsTable, type SubmissionRow } from "@/components/submissions-table";
import { Analytics, type AnalyticsData } from "@/components/analytics";
import { SimilarityCard } from "@/components/similarity-card";
import { topSimilarPairs } from "@/lib/similarity";
import type { SimilarPair } from "@/lib/similarity";

export const dynamic = "force-dynamic";

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

export default async function DashboardPage() {
  // Дашборд не должен падать с 500, если БД недоступна
  // (например, не задан DATABASE_URL на свежем деплое).
  let rows: Array<{
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
    createdAt: Date;
    findingsCount: number;
    criticalCount: number;
  }> = [];
  let severityRows: Array<{ severity: string; count: number }> = [];
  let categoryRows: Array<{ category: string; count: number }> = [];
  let pairs: SimilarPair[] = [];

  try {
    const db = await getDb();
    rows = await db
      .select({
        publicId: submissions.publicId,
        title: submissions.title,
        author: submissions.author,
        cohort: submissions.cohort,
        language: submissions.language,
        sourceKind: submissions.sourceKind,
        status: submissions.status,
        score: submissions.score,
        complexity: submissions.complexity,
        verdict: submissions.verdict,
        engine: submissions.engine,
        createdAt: submissions.createdAt,
        // См. комментарий в api/submissions/route.ts: коррелированный
        // подзапрос с ${submissions.id} drizzle квалифицирует неверно,
        // поэтому считаем агрегаты через LEFT JOIN + GROUP BY по PK.
        findingsCount: count(findings.id),
        criticalCount: sql<number>`count(*) filter (where ${findings.severity} = 'critical')::int`,
      })
      .from(submissions)
      .leftJoin(findings, eq(findings.submissionId, submissions.id))
      .groupBy(submissions.id)
      .orderBy(desc(submissions.createdAt))
      .limit(60);

    [severityRows, categoryRows] = await Promise.all([
      db.select({ severity: findings.severity, count: count() }).from(findings).groupBy(findings.severity),
      db.select({ category: findings.category, count: count() }).from(findings).groupBy(findings.category),
    ]);

    // Антиплагиат: берём до 25 последних завершённых работ с текстами
    // (первые 20К символов файла достаточно для фингерпринта).
    const completedIds = rows
      .filter((r) => r.status === "completed")
      .slice(0, 25)
      .map((r) => r.publicId);
    if (completedIds.length >= 2) {
      const fileRows = await db
        .select({
          publicId: submissions.publicId,
          title: submissions.title,
          author: submissions.author,
          language: submissions.language,
          content: sql<string>`substring(${reviewFiles.content}, 1, 20000)`,
        })
        .from(submissions)
        .innerJoin(reviewFiles, eq(reviewFiles.submissionId, submissions.id))
        .where(inArray(submissions.publicId, completedIds));

      const byId = new Map<
        string,
        { publicId: string; title: string; author: string; language: string; contents: string[] }
      >();
      for (const fr of fileRows) {
        const entry = byId.get(fr.publicId) ?? {
          publicId: fr.publicId,
          title: fr.title,
          author: fr.author,
          language: fr.language,
          contents: [],
        };
        if (entry.contents.length < 25 && fr.content) entry.contents.push(fr.content);
        byId.set(fr.publicId, entry);
      }
      pairs = topSimilarPairs(Array.from(byId.values()), 4, 0.45);
    }
  } catch (error) {
    console.error("[dashboard] БД недоступна:", error);
  }

  const serialized: SubmissionRow[] = rows.map((r) => ({
    ...r,
    createdAt: r.createdAt.toISOString(),
  }));

  const completed = serialized.filter((r) => r.status === "completed");
  const avgScore = completed.length
    ? Math.round(completed.reduce((s, r) => s + (r.score ?? 0), 0) / completed.length)
    : 0;
  const totalFindings = serialized.reduce((s, r) => s + r.findingsCount, 0);
  const totalCritical = serialized.reduce((s, r) => s + r.criticalCount, 0);
  const quadratic = serialized.filter((r) => (r.complexity ?? "").includes("^")).length;

  const stats = [
    { label: "Всего проверок", value: serialized.length, hint: "за последние 60 записей" },
    { label: "Средний балл", value: avgScore, hint: "по завершённым ревью" },
    { label: "Замечаний", value: totalFindings, hint: `${totalCritical} критических` },
    { label: "Полиномиальная сложность", value: quadratic, hint: "работ с O(N²) и хуже" },
  ];

  const analytics: AnalyticsData = {
    histogram: (() => {
      const buckets = Array(10).fill(0) as number[];
      for (const r of completed) {
        if (r.score === null) continue;
        buckets[Math.min(9, Math.floor(r.score / 10))] += 1;
      }
      return buckets;
    })(),
    severity: {
      critical: severityRows.find((r) => r.severity === "critical")?.count ?? 0,
      major: severityRows.find((r) => r.severity === "major")?.count ?? 0,
      minor: severityRows.find((r) => r.severity === "minor")?.count ?? 0,
      info: severityRows.find((r) => r.severity === "info")?.count ?? 0,
    },
    categories: categoryRows
      .map((r) => ({ key: r.category, label: CATEGORY_LABEL[r.category] ?? r.category, count: r.count }))
      .sort((a, b) => b.count - a.count),
    trend: (() => {
      const byDay = new Map<string, { sum: number; n: number; ts: number }>();
      for (const r of completed) {
        if (r.score === null) continue;
        const d = new Date(r.createdAt);
        const key = d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
        const entry = byDay.get(key) ?? { sum: 0, n: 0, ts: d.getTime() };
        entry.sum += r.score;
        entry.n += 1;
        byDay.set(key, entry);
      }
      return Array.from(byDay.entries())
        .sort((a, b) => a[1].ts - b[1].ts)
        .slice(-14)
        .map(([day, v]) => ({ day, avg: Math.round(v.sum / v.n), n: v.n }));
    })(),
  };

  return (
    <div className="mx-auto max-w-7xl px-6 py-12">
      <Reveal>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Дашборд преподавателя</h1>
            <p className="mt-2 text-slate-400">
              Очередь проверок, агрегированные метрики качества и быстрый доступ к inline-ревью.
            </p>
          </div>
          <Link
            href="/new"
            className="rounded-xl bg-gradient-to-r from-ray-400 to-violet-ray px-5 py-2.5 text-sm font-semibold text-ink-950 transition-transform hover:scale-[1.02]"
          >
            + Новое ревью
          </Link>
        </div>
      </Reveal>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s, i) => (
          <Reveal key={s.label} delay={i * 0.05}>
            <div className="glass rounded-2xl p-5">
              <p className="text-xs uppercase tracking-wider text-slate-500">{s.label}</p>
              <p className="mt-3 font-mono text-4xl text-slate-100">{s.value}</p>
              <p className="mt-1 text-xs text-slate-500">{s.hint}</p>
            </div>
          </Reveal>
        ))}
      </div>

      <div className="mt-8">
        <Reveal delay={0.05}>
          <Analytics data={analytics} />
        </Reveal>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_380px]">
        <Reveal delay={0.08}>
          <SubmissionsTable rows={serialized} />
        </Reveal>
        <div className="space-y-4">
          <Reveal delay={0.1}>
            <SimilarityCard pairs={pairs} />
          </Reveal>
          <Reveal delay={0.12}>
            <div className="glass rounded-2xl p-5">
              <h3 className="text-sm font-semibold text-slate-100">Как читать дашборд</h3>
              <ul className="mt-3 space-y-2 text-xs leading-relaxed text-slate-400">
                <li>• <span className="text-slate-200">Гистограмма влево</span> — тема не усвоена, разберите её на занятии.</li>
                <li>• <span className="text-slate-200">Рост критических</span> — запретите опасные функции: `gets`, `strcpy` без `n`, `malloc` без проверки.</li>
                <li>• <span className="text-slate-200">Пара в антиплагиате {">"}70%</span> — откройте оба ревью и сравните построчно.</li>
                <li>• <span className="text-slate-200">Тренд вниз</span> — следующее задание оказалось сложнее, скорректируйте дедлайн.</li>
              </ul>
            </div>
          </Reveal>
        </div>
      </div>
    </div>
  );
}
