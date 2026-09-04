/**
 * СинтексПруф — единый роутер ИИ-провайдеров.
 * Поддерживает российские нейросети (Gigachat, YandexGPT) и Gemini.
 *
 * Приоритет:
 *  - AI_PROVIDER=auto (default): Gigachat → YandexGPT → Gemini → heuristic
 *  - AI_PROVIDER=gigachat / yandexgpt / gemini — принудительно один
 *  - AI_FALLBACK=false — не фолбэчить, если выбранный провайдер не настроен
 */

import { isGeminiConfigured, requestGeminiReview, getGeminiModelName } from "@/lib/ai/gemini";
import { isGigachatConfigured, requestGigachatReview, getGigachatModelName } from "./gigachat";
import { isYandexGPTConfigured, requestYandexGPTReview, getYandexGPTModelName } from "./yandexgpt";
import type { AIReview } from "./common";
import type { DirectAIConfig } from "@/lib/ai/direct-config";
import type { SandboxReport, SourceFile } from "@/lib/types";

export type AIProviderName = "gigachat" | "yandexgpt" | "gemini" | "heuristic";
export type AIProviderConfig = "auto" | AIProviderName;

export interface AIProviderStatus {
  provider: AIProviderName;
  configured: boolean;
  model: string;
}

function getPreferred(): AIProviderConfig {
  const raw = (process.env.AI_PROVIDER ?? "auto").trim().toLowerCase();
  if (raw === "gigachat" || raw === "yandexgpt" || raw === "yandex" || raw === "gemini" || raw === "heuristic") {
    return raw === "yandex" ? "yandexgpt" : (raw as AIProviderConfig);
  }
  return "auto";
}

function shouldFallback(): boolean {
  const v = (process.env.AI_FALLBACK ?? "true").trim().toLowerCase();
  return v !== "false" && v !== "0" && v !== "no";
}

export function getAvailableProviders(): AIProviderStatus[] {
  return [
    { provider: "gigachat", configured: isGigachatConfigured(), model: getGigachatModelName() },
    { provider: "yandexgpt", configured: isYandexGPTConfigured(), model: getYandexGPTModelName() },
    { provider: "gemini", configured: isGeminiConfigured(), model: getGeminiModelName() },
    { provider: "heuristic", configured: true, model: "heuristic-engine" },
  ];
}

export function isAnyAIConfigured(): boolean {
  return isGigachatConfigured() || isYandexGPTConfigured() || isGeminiConfigured();
}

export function getActiveProviderName(): AIProviderName {
  const preferred = getPreferred();
  if (preferred !== "auto") return preferred;

  // Российские первыми: Gigachat → YandexGPT → Gemini
  if (isGigachatConfigured()) return "gigachat";
  if (isYandexGPTConfigured()) return "yandexgpt";
  if (isGeminiConfigured()) return "gemini";
  return "heuristic";
}

export function getActiveModelName(): string {
  const name = getActiveProviderName();
  switch (name) {
    case "gigachat":
      return getGigachatModelName();
    case "yandexgpt":
      return getYandexGPTModelName();
    case "gemini":
      return getGeminiModelName();
    default:
      return "heuristic-engine";
  }
}

/**
 * Унифицированный вызов ИИ-ревью. Пробует провайдеры по приоритету,
 * возвращает null если ни один не настроен или все упали.
 */
export async function requestAIReview(params: {
  title: string;
  language: string;
  files: SourceFile[];
  sandbox: SandboxReport;
  aiConfig?: DirectAIConfig;
}): Promise<{ review: AIReview; provider: AIProviderName; model: string } | null> {
  const direct = params.aiConfig;
  const preferred = direct?.provider && direct.provider !== "auto" ? direct.provider : getPreferred();
  const fallback = direct?.provider && direct.provider !== "auto" ? false : shouldFallback();

  if (preferred === "heuristic") return null;

  const tryOrder: AIProviderName[] =
    preferred === "auto"
      ? ["gigachat", "yandexgpt", "gemini"]
      : [preferred as AIProviderName];

  for (const provider of tryOrder) {
    try {
      let review: AIReview | null = null;
      let model = "";
      if (provider === "gigachat") {
        if (!isGigachatConfigured(direct)) continue;
        review = await requestGigachatReview({ ...params, aiConfig: direct });
        model = getGigachatModelName(direct);
      } else if (provider === "yandexgpt") {
        if (!isYandexGPTConfigured(direct)) continue;
        review = await requestYandexGPTReview({ ...params, aiConfig: direct });
        model = getYandexGPTModelName(direct);
      } else if (provider === "gemini") {
        if (!isGeminiConfigured(direct)) continue;
        review = await requestGeminiReview({ ...params, aiConfig: direct });
        model = getGeminiModelName(direct);
      }
      if (review) return { review, provider, model };
      // Провайдер настроен, но вернул null (ошибка сети/квота) — пробуем фолбэк если разрешён
      if (!fallback) return null;
    } catch (e) {
      console.error(`[ai] ${provider} failed:`, e);
      if (!fallback) return null;
    }
  }

  // Если auto и все российские/Gemini упали, вернётся null → pipeline деградирует в heuristic
  return null;
}
