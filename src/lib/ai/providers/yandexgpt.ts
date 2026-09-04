/**
 * СинтексПруф — провайдер YandexGPT (Yandex Cloud Foundation Models).
 * Документация: https://yandex.cloud/ru/docs/foundation-models/concepts/yandexgpt/
 *
 * Endpoint: POST https://llm.api.cloud.yandex.net/foundationModels/v1/completion
 * Auth: Api-Key <YANDEX_API_KEY> + x-folder-id
 */

import { SINTEKSPROOF_SYSTEM_PROMPT } from "./common";
import { buildUserPrompt, normalizeAIResponse, parseJsonBlock, type AIReview } from "./common";
import type { DirectAIConfig } from "@/lib/ai/direct-config";
import type { SandboxReport, SourceFile } from "@/lib/types";

function getModel(config?: DirectAIConfig): string {
  return config?.model?.trim() || process.env.YANDEXGPT_MODEL || "yandexgpt";
}
function getFolderId(config?: DirectAIConfig): string | undefined {
  return config?.folderId?.trim() || process.env.YANDEX_FOLDER_ID?.trim();
}
function getApiKey(config?: DirectAIConfig): string | undefined {
  return config?.apiKey?.trim() || process.env.YANDEX_API_KEY?.trim() || process.env.YANDEXGPT_API_KEY?.trim();
}

export function isYandexGPTConfigured(config?: DirectAIConfig): boolean {
  const model = getModel(config);
  return Boolean(getApiKey(config) && (getFolderId(config) || model.startsWith("gpt://")));
}

export async function requestYandexGPTReview(params: {
  title: string;
  language: string;
  files: SourceFile[];
  sandbox: SandboxReport;
  aiConfig?: DirectAIConfig;
}): Promise<AIReview | null> {
  const apiKey = getApiKey(params.aiConfig);
  const folderId = getFolderId(params.aiConfig);
  const model = getModel(params.aiConfig);
  if (!apiKey || (!folderId && !model.startsWith("gpt://"))) return null;

  const modelUri = model.startsWith("gpt://") ? model : `gpt://${folderId}/${model}/latest`;
  const userPrompt = buildUserPrompt(params);

  const body = {
    modelUri,
    completionOptions: {
      stream: false,
      temperature: 0.25,
      maxTokens: "8192",
    },
    messages: [
      { role: "system", text: SINTEKSPROOF_SYSTEM_PROMPT },
      { role: "user", text: userPrompt },
    ],
  };

  const controller = new AbortController();
  const timeoutMs = params.aiConfig?.provider && params.aiConfig.provider !== "auto" ? 45_000 : 18_000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Api-Key ${apiKey}`,
    };
    if (folderId) headers["x-folder-id"] = folderId;
    const res = await fetch("https://llm.api.cloud.yandex.net/foundationModels/v1/completion", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      console.error("[yandexgpt] HTTP", res.status, (await res.text()).slice(0, 800));
      return null;
    }
    const json = (await res.json()) as {
      result?: {
        alternatives?: Array<{ message?: { text?: string } }>;
      };
    };
    const text = json.result?.alternatives?.[0]?.message?.text ?? "";
    if (!text.trim()) return null;
    const normalized = normalizeAIResponse(parseJsonBlock(text), params.files);
    normalized.findings = normalized.findings.map((f) => ({ ...f, origin: "yandexgpt" as const }));
    return normalized;
  } catch (e) {
    console.error("[yandexgpt] request failed", e);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export function getYandexGPTModelName(config?: DirectAIConfig): string {
  const model = getModel(config);
  if (model.startsWith("gpt://")) return model.replace(/^gpt:\/\//, "yandexgpt://");
  return `yandexgpt://${getFolderId(config) ?? "folder"}/${model}`;
}
