/**
 * Оркестратор ревью СинтексПруф.
 *
 * Шаги:
 *  1. Песочница — либо внешний FastAPI+Docker раннер (SANDBOX_API_URL),
 *     либо встроенный детерминированный движок (fallback).
 *  2. Семантическое ревью ИИ (приоритет: Gigachat → YandexGPT → Gemini, см. AI_PROVIDER).
 *  3. Слияние находок, расчёт итоговых баллов и формирование отчёта.
 */
import { requestAIReview, getActiveModelName } from "@/lib/ai/providers";
import type { DirectAIConfig } from "@/lib/ai/direct-config";
import { runStaticAnalysis } from "@/lib/analyzer/static-engine";
import { detectAIGeneratedCode, mergeWithLLMOpinion } from "@/lib/ai-detection";
import type { AnalysisFinding, ReviewReport, SandboxReport, SourceFile } from "@/lib/types";

/** Обращение к внешней песочнице (FastAPI). Падение → локальный движок. */
async function runSandbox(files: SourceFile[]): Promise<SandboxReport> {
  const url = process.env.SANDBOX_API_URL;
  if (!url) return runStaticAnalysis(files);
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);
    const response = await fetch(`${url.replace(/\/$/, "")}/api/sandbox/analyze`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.SANDBOX_API_TOKEN
          ? { Authorization: `Bearer ${process.env.SANDBOX_API_TOKEN}` }
          : {}),
      },
      body: JSON.stringify({ files }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!response.ok) throw new Error(`sandbox HTTP ${response.status}`);
    return (await response.json()) as SandboxReport;
  } catch (error) {
    console.warn("[pipeline] внешняя песочница недоступна, использую встроенный движок:", error);
    const local = runStaticAnalysis(files);
    local.log.unshift("[warn] SANDBOX_API_URL недоступен — выполнен локальный статический анализ");
    return local;
  }
}

const PENALTY: Record<AnalysisFinding["severity"], number> = {
  critical: 15,
  major: 7,
  minor: 2,
  info: 0.5,
};

function scoreFromFindings(findings: AnalysisFinding[]): number {
  const total = findings.reduce((sum, f) => sum + PENALTY[f.severity], 0);
  return Math.max(5, Math.min(100, Math.round(100 - total)));
}

function verdictFor(score: number): string {
  if (score >= 90) return "Отлично";
  if (score >= 75) return "Хорошо";
  if (score >= 60) return "Удовлетворительно";
  if (score >= 40) return "Требует доработки";
  return "Неудовлетворительно";
}

/** Детерминированный отчёт, когда Gemini недоступен. */
function heuristicReport(sandbox: SandboxReport, files: SourceFile[]): ReviewReport {
  const findings = sandbox.findings;
  const score = scoreFromFindings(findings);
  const byCategory = (cat: AnalysisFinding["category"]) =>
    findings.filter((f) => f.category === cat);

  const readability = Math.max(
    10,
    100 - byCategory("readability").length * 6 - byCategory("style").length * 3,
  );
  const architecture = Math.max(10, 100 - byCategory("architecture").length * 9);
  const memory = byCategory("memory").concat(byCategory("pointers"));

  const summary = `Проанализировано ${sandbox.metrics.files} файл(ов), ${sandbox.metrics.totalLines} строк. ` +
    `Детерминированный анализ выявил ${findings.length} замечани(й), из них критических — ` +
    `${findings.filter((f) => f.severity === "critical").length}. ` +
    `Оценка худшей асимптотики по проекту — ${sandbox.complexity.estimate}. ` +
    `Для семантического ревью подключите один из ключей: GIGACHAT_CLIENT_SECRET, YANDEX_API_KEY или GEMINI_API_KEY (AI_PROVIDER=auto).`;

  return {
    score,
    readability,
    architecture,
    complexity: sandbox.complexity.estimate,
    verdict: verdictFor(score),
    summary,
    strengths: [
      sandbox.metrics.commentRatio > 0.08
        ? `Приемлемая плотность комментариев (${(sandbox.metrics.commentRatio * 100).toFixed(1)}%)`
        : "Код структурирован по файлам, что упрощает навигацию",
      sandbox.metrics.maxNestingDepth <= 3
        ? "Вложенность управляющих конструкций в пределах нормы (≤3)"
        : "Проект компилируется/парсится без фатальных ошибок структуры",
    ],
    risks: [
      ...sandbox.complexity.hotspots.slice(0, 3).map((h) => `${h.file}:${h.line} — ${h.estimate}: ${h.reason}`),
      ...memory.slice(0, 2).map((f) => `${f.filePath}:${f.line} — ${f.title}`),
    ].slice(0, 5),
    actionItems: Array.from(
      new Set(findings.filter((f) => f.suggestion).map((f) => f.suggestion as string)),
    ).slice(0, 8),
    sections: [
      {
        title: "Асимптотическая сложность",
        body:
          sandbox.complexity.hotspots.length > 0
            ? sandbox.complexity.hotspots
                .map((h) => `• ${h.file}:${h.line} → ${h.estimate}. ${h.reason}`)
                .join("\n")
            : "Явных участков квадратичной и худшей сложности не обнаружено; преобладают линейные проходы.",
      },
      {
        title: "Управление памятью и ресурсами",
        body:
          memory.length > 0
            ? memory.map((f) => `• ${f.filePath}:${f.line} — ${f.title}. ${f.message}`).join("\n")
            : "Явных проблем с выделением/освобождением ресурсов статический анализ не обнаружил.",
      },
      {
        title: "Архитектура и декомпозиция",
        body:
          `Средняя длина функции — ${sandbox.metrics.avgFunctionLength} строк, максимальная вложенность — ` +
          `${sandbox.metrics.maxNestingDepth}, цикломатическая сложность ≈ ${sandbox.metrics.cyclomaticComplexity}, ` +
          `дублирующихся блоков — ${sandbox.metrics.duplicateBlocks}.`,
      },
      {
        title: "Читаемость и стиль",
        body:
          `Доля комментариев — ${(sandbox.metrics.commentRatio * 100).toFixed(1)}%. ` +
          `Замечаний по читаемости — ${byCategory("readability").length}, по стилю — ${byCategory("style").length}.`,
      },
    ],
    sandbox,
    engine: `${sandbox.engine} (без ИИ)`,
    aiDetection: detectAIGeneratedCode(files),
  };
}

/** Полный прогон ревью. */
export async function analyzeSubmission(params: {
  title: string;
  language: string;
  files: SourceFile[];
  aiConfig?: DirectAIConfig;
}): Promise<ReviewReport> {
  const sandbox = await runSandbox(params.files);
  const aiResult = await requestAIReview({
    title: params.title,
    language: params.language,
    files: params.files,
    sandbox,
    aiConfig: params.aiConfig,
  });

  if (!aiResult) {
    return heuristicReport(sandbox, params.files);
  }

  const { review: aiReview, model } = aiResult;

  // Слияние: приоритет у ИИ, детерминированные находки дополняют картину
  // (кроме дублей по «файл:строка»).
  const aiKeys = new Set(aiReview.findings.map((f) => `${f.filePath}:${f.line}`));
  const merged = [
    ...aiReview.findings,
    ...sandbox.findings.filter((f) => !aiKeys.has(`${f.filePath}:${f.line}`)),
  ].slice(0, 140);

  return {
    score: aiReview.score,
    readability: aiReview.readability,
    architecture: aiReview.architecture,
    complexity: aiReview.complexity || sandbox.complexity.estimate,
    verdict: aiReview.verdict || verdictFor(aiReview.score),
    summary: aiReview.summary,
    strengths: aiReview.strengths,
    risks: aiReview.risks,
    actionItems: aiReview.actionItems,
    sections: aiReview.sections,
    sandbox: { ...sandbox, findings: merged },
    engine: model || getActiveModelName(),
    aiDetection: mergeWithLLMOpinion(detectAIGeneratedCode(params.files), aiReview.aiGenerated),
  };
}
