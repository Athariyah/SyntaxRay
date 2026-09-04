import type { AIProviderName } from "@/lib/ai/providers";

export type DirectAIProviderName = Extract<AIProviderName, "gigachat" | "yandexgpt" | "gemini" | "heuristic"> | "auto";

export interface DirectAIConfig {
  provider: DirectAIProviderName;
  model?: string;
  apiKey?: string;
  folderId?: string;
}

const PROVIDERS = new Set<DirectAIProviderName>(["auto", "gigachat", "yandexgpt", "gemini", "heuristic"]);

function clean(value: unknown, max = 512): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : undefined;
}

/**
 * Достаёт разовую конфигурацию ИИ из тела запроса.
 * Ключи используются только в памяти текущего запроса и не сохраняются в БД/отчёте.
 */
export function parseDirectAIConfig(value: unknown): DirectAIConfig | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  const provider = clean(raw.provider, 32)?.toLowerCase() as DirectAIProviderName | undefined;
  if (!provider || !PROVIDERS.has(provider)) return undefined;

  return {
    provider,
    model: clean(raw.model, 160),
    apiKey: clean(raw.apiKey, 4096),
    folderId: clean(raw.folderId, 160),
  };
}

export function directConfigHasCredentials(config: DirectAIConfig | undefined): boolean {
  if (!config || config.provider === "auto" || config.provider === "heuristic") return true;
  if (config.provider === "yandexgpt") {
    const modelContainsFolder = Boolean(config.model?.startsWith("gpt://"));
    return Boolean(config.apiKey && (config.folderId || modelContainsFolder));
  }
  return Boolean(config.apiKey);
}

export function publicDirectModelName(config: DirectAIConfig | undefined): string | undefined {
  if (!config || config.provider === "auto") return undefined;
  if (config.provider === "heuristic") return "heuristic-engine";
  return config.model || config.provider;
}
