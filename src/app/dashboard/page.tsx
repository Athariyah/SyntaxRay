import Link from "next/link";
import { count, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { findings, submissions } from "@/db/schema";
import { Reveal } from "@/components/reveal";
import { SubmissionsTable, type SubmissionRow } from "@/components/submissions-table";

export const dynamic = "force-dynamic";

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
        <Reveal delay={0.1}>
          <SubmissionsTable rows={serialized} />
        </Reveal>
      </div>
    </div>
  );
}
