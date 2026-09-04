/** Общие типы домена СинтексПруф (используются и фронтом, и API-роутами). */
import type { AIDetectionReport } from "@/lib/ai-detection";

export type { AIDetectionReport, AIDetectionSignal, AIDetectionLevel } from "@/lib/ai-detection";

export type Severity = "critical" | "major" | "minor" | "info";

export type FindingCategory =
  | "memory"
  | "pointers"
  | "complexity"
  | "architecture"
  | "readability"
  | "security"
  | "style"
  | "correctness";

export interface SourceFile {
  path: string;
  language: string;
  content: string;
}

export interface AnalysisFinding {
  filePath: string;
  line: number;
  endLine?: number | null;
  severity: Severity;
  category: FindingCategory;
  title: string;
  message: string;
  suggestion?: string | null;
    origin: "heuristic" | "gemini" | "gigachat" | "yandexgpt" | "sandbox";
}

/** Результат работы песочницы (Docker) — детерминированные метрики. */
export interface SandboxReport {
  engine: string;
  toolchain: string[];
  metrics: {
    files: number;
    totalLines: number;
    codeLines: number;
    commentLines: number;
    commentRatio: number;
    avgFunctionLength: number;
    maxNestingDepth: number;
    cyclomaticComplexity: number;
    longestFunction: { name: string; lines: number; file: string } | null;
    duplicateBlocks: number;
  };
  complexity: {
    estimate: string;
    hotspots: Array<{ file: string; line: number; estimate: string; reason: string }>;
  };
  findings: AnalysisFinding[];
  log: string[];
}

/** Итоговый академический отчёт (Gemini + песочница). */
export interface ReviewReport {
  score: number;
  readability: number;
  architecture: number;
  complexity: string;
  verdict: string;
  summary: string;
  strengths: string[];
  risks: string[];
  actionItems: string[];
  sections: Array<{ title: string; body: string }>;
  sandbox: SandboxReport;
  engine: string;
  /** Оценка вероятности ИИ-генерации кода (стилометрия + мнение LLM). */
  aiDetection?: AIDetectionReport | null;
}

