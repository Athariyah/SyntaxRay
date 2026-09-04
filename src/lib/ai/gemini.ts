/**
 * Клиент Gemini API (server-only).
 *
 * Ключ читается ИСКЛЮЧИТЕЛЬНО из переменной окружения GEMINI_API_KEY.
 * На Vercel: Project → Settings → Environment Variables → GEMINI_API_KEY.
 * Никогда не обращайтесь к этому модулю из клиентских компонентов.
 */
import { parseAIGenerated } from "@/lib/ai/providers/common";
import { SYNTAXRAY_SYSTEM_PROMPT } from "@/lib/ai/system-prompt";
import type { DirectAIConfig } from "@/lib/ai/direct-config";
import type { AnalysisFinding, SandboxReport, SourceFile } from "@/lib/types";

function getModel(config?: DirectAIConfig): string {
  return config?.model?.trim() || process.env.GEMINI_MODEL || "gemini-2.5-flash";
}
const ENDPOINT = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

/** Ответ модели после валидации. */
export interface GeminiReview {
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
  findings: AnalysisFinding[];
  aiGenerated?: { probability: number; reasoning: string } | null;
}

export function isGeminiConfigured(config?: DirectAIConfig): boolean {
  return Boolean(config?.apiKey?.trim() || process.env.GEMINI_API_KEY);
}

/** Файлы с нумерацией строк — модель обязана ссылаться на эти номера. */
function renderFiles(files: SourceFile[], budget = 46_000): string {
  const chunks: string[] = [];
  let used = 0;
  for (const file of files) {
    const numbered = file.content
      .split("\n")
      .map((line, i) => `${String(i + 1).padStart(4, " ")} | ${line}`)
      .join("\n");
    const block = `\n### ФАЙЛ: ${file.path} (язык: ${file.language})\n\`\`\`${file.language}\n${numbered}\n\`\`\`\n`;
    if (used + block.length > budget) {
      chunks.push(`\n### ФАЙЛ: ${file.path} — усечён из-за лимита контекста\n`);
      continue;
    }
    used += block.length;
    chunks.push(block);
  }
  return chunks.join("");
}

function renderSandbox(sandbox: SandboxReport): string {
  const m = sandbox.metrics;
  const top = sandbox.findings
    .slice(0, 40)
    .map((f) => `- [${f.severity}/${f.category}] ${f.filePath}:${f.line} — ${f.title}`)
    .join("\n");
  const hotspots = sandbox.complexity.hotspots
    .map((h) => `- ${h.file}:${h.line} → ${h.estimate} (${h.reason})`)
    .join("\n");
  return `
## ОТЧЁТ ДЕТЕРМИНИРОВАННОЙ ПЕСОЧНИЦЫ (${sandbox.engine})
Инструменты: ${sandbox.toolchain.join(", ")}
Метрики: файлов=${m.files}, строк=${m.totalLines}, кода=${m.codeLines}, комментариев=${m.commentLines}
(доля ${(m.commentRatio * 100).toFixed(1)}%), средняя длина функции=${m.avgFunctionLength},
макс. вложенность=${m.maxNestingDepth}, цикломатическая сложность≈${m.cyclomaticComplexity},
дублирующихся блоков=${m.duplicateBlocks}, самая длинная функция=${
    m.longestFunction ? `${m.longestFunction.name} (${m.longestFunction.lines} строк)` : "н/д"
  }
Предварительная асимптотика: ${sandbox.complexity.estimate}

### Горячие точки сложности
${hotspots || "- не обнаружено"}

### Предварительные срабатывания линтеров (проверь на ложные)
${top || "- нет"}

### Лог компиляции
${sandbox.log.join("\n")}
`;
}

function buildUserPrompt(params: {
  title: string;
  language: string;
  files: SourceFile[];
  sandbox: SandboxReport;
}): string {
  return `# ЗАДАНИЕ НА РЕВЬЮ
Название работы: ${params.title}
Основной язык: ${params.language}
Количество файлов: ${params.files.length}

${renderSandbox(params.sandbox)}

## ИСХОДНЫЙ КОД (строки пронумерованы; используй ИМЕННО эти номера)
${renderFiles(params.files)}

Проведи полное академическое ревью по всем осям A–F и верни строго JSON по заданной схеме.`;
}

/** Аккуратно достаём JSON, даже если модель обернула его в ```json. */
function parseJsonBlock(text: string): unknown {
  const cleaned = text
    .replace(/^\s*```(?:json)?/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1));
    }
    throw new Error("Gemini вернул невалидный JSON");
  }
}

const SEVERITIES = new Set(["critical", "major", "minor", "info"]);
const CATEGORIES = new Set([
  "memory",
  "pointers",
  "complexity",
  "architecture",
  "readability",
  "security",
  "style",
  "correctness",
]);

function clampInt(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string" && v.trim().length > 0).slice(0, 10);
}

/** Нормализация ответа модели + защита от «выдуманных» строк. */
function normalize(raw: unknown, files: SourceFile[]): GeminiReview {
  const data = (raw ?? {}) as Record<string, unknown>;
  const lineLimits = new Map(files.map((f) => [f.path, f.content.split("\n").length]));

  const findings: AnalysisFinding[] = Array.isArray(data.findings)
    ? (data.findings as Record<string, unknown>[])
        .map((f) => {
          const filePath =
            typeof f.filePath === "string" && lineLimits.has(f.filePath)
              ? f.filePath
              : (files[0]?.path ?? "project");
          const maxLine = lineLimits.get(filePath) ?? 1;
          const line = Math.max(1, Math.min(maxLine, Number(f.line) || 1));
          const endLineRaw = Number(f.endLine);
          return {
            filePath,
            line,
            endLine: Number.isFinite(endLineRaw)
              ? Math.max(line, Math.min(maxLine, endLineRaw))
              : null,
            severity: (SEVERITIES.has(String(f.severity)) ? f.severity : "minor") as AnalysisFinding["severity"],
            category: (CATEGORIES.has(String(f.category))
              ? f.category
              : "style") as AnalysisFinding["category"],
            title: String(f.title ?? "Замечание").slice(0, 200),
            message: String(f.message ?? "").slice(0, 2000),
            suggestion: f.suggestion ? String(f.suggestion).slice(0, 1200) : null,
            origin: "gemini" as const,
          };
        })
        .slice(0, 25)
    : [];

  const sections = Array.isArray(data.sections)
    ? (data.sections as Record<string, unknown>[])
        .filter((s) => s && typeof s.title === "string")
        .map((s) => ({ title: String(s.title), body: String(s.body ?? "") }))
        .slice(0, 8)
    : [];

  return {
    score: clampInt(data.score, 70),
    readability: clampInt(data.readability, 70),
    architecture: clampInt(data.architecture, 70),
    complexity: typeof data.complexity === "string" ? data.complexity.slice(0, 48) : "O(N)",
    verdict: typeof data.verdict === "string" ? data.verdict.slice(0, 48) : "Хорошо",
    summary: typeof data.summary === "string" ? data.summary : "",
    strengths: toStringArray(data.strengths),
    risks: toStringArray(data.risks),
    actionItems: toStringArray(data.actionItems),
    sections,
    findings,
    aiGenerated: parseAIGenerated(data.aiGenerated),
  };
}

/**
 * Вызов Gemini. Возвращает null, если ключ не задан или API недоступен —
 * в этом случае пайплайн деградирует до детерминированного отчёта.
 */
export async function requestGeminiReview(params: {
  title: string;
  language: string;
  files: SourceFile[];
  sandbox: SandboxReport;
  aiConfig?: DirectAIConfig;
}): Promise<GeminiReview | null> {
  const apiKey = params.aiConfig?.apiKey?.trim() || process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const body = {
    systemInstruction: { parts: [{ text: SYNTAXRAY_SYSTEM_PROMPT }] },
    contents: [{ role: "user", parts: [{ text: buildUserPrompt(params) }] }],
    generationConfig: {
      temperature: 0.25,
      topP: 0.9,
      maxOutputTokens: 8192,
      responseMimeType: "application/json",
    },
  };

  const controller = new AbortController();
  const timeoutMs = params.aiConfig?.provider && params.aiConfig.provider !== "auto" ? 45_000 : 18_000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(ENDPOINT(getModel(params.aiConfig)), {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) {
      console.error("[gemini] HTTP", response.status, (await response.text()).slice(0, 500));
      return null;
    }
    const json = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    if (!text.trim()) return null;
    return normalize(parseJsonBlock(text), params.files);
  } catch (error) {
    console.error("[gemini] request failed:", error);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/** Имя модели на момент вызова — читается лениво, чтобы Vercel не инлайнил env на этапе сборки. */
export const GEMINI_MODEL_NAME = getModel();
export function getGeminiModelName(config?: DirectAIConfig): string {
  return getModel(config);
}
