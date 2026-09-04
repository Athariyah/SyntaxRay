/**
 * СинтексПруф — провайдер YandexGPT (Yandex Cloud Foundation Models).
 * Документация: https://yandex.cloud/ru/docs/foundation-models/concepts/yandexgpt/
 *
 * Endpoint: POST https://llm.api.cloud.yandex.net/foundationModels/v1/completion
 * Auth: Api-Key <YANDEX_API_KEY> + x-folder-id
 */

import { SINTEKSPROOF_SYSTEM_PROMPT } from "./common";
import { buildUserPrompt, normalizeAIResponse, parseJsonBlock, type AIReview } from "./common";
import type { SandboxReport, SourceFile } from "@/lib/types";

function getModel(): string {
  return process.env.YANDEXGPT_MODEL ?? "yandexgpt";
}
function getFolderId(): string | undefined {
  return process.env.YANDEX_FOLDER_ID?.trim();
}
function getApiKey(): string | undefined {
  return process.env.YANDEX_API_KEY?.trim() ?? process.env.YANDEXGPT_API_KEY?.trim();
}

export function isYandexGPTConfigured(): boolean {
  return Boolean(getApiKey() && getFolderId());
}

export async function requestYandexGPTReview(params: {
  title: string;
  language: string;
  files: SourceFile[];
  sandbox: SandboxReport;
}): Promise<AIReview | null> {
  const apiKey = getApiKey();
  const folderId = getFolderId();
  if (!apiKey || !folderId) return null;

  const modelUri = `gpt://${folderId}/${getModel()}/latest`;
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
  const timeout = setTimeout(() => controller.abort(), 90_000);
  try {
    const res = await fetch("https://llm.api.cloud.yandex.net/foundationModels/v1/completion", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Api-Key ${apiKey}`,
        "x-folder-id": folderId,
      },
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
    return normalized;
  } catch (e) {
    console.error("[yandexgpt] request failed", e);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export function getYandexGPTModelName(): string {
  return `yandexgpt://${getFolderId()}/${getModel()}`;
}
