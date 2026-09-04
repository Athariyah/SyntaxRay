/**
 * СинтексПруф — провайдер GigaChat (Сбер).
 * Документация: https://developers.sber.ru/docs/ru/gigachat/api/overview
 *
 * Аутентификация: OAuth 2.0 client credentials через ngw.devices.sberbank.ru
 *  POST https://ngw.devices.sberbank.ru:9443/api/v2/oauth
 *    Headers: Authorization: Basic base64(clientId:clientSecret), RqUID, Content-Type
 *    Body: scope=GIGACHAT_API_PERS
 *
 * Чат: POST https://gigachat.devices.sberbank.ru/api/v1/chat/completions
 */

import { SINTEKSPROOF_SYSTEM_PROMPT } from "./common";
import { buildUserPrompt, normalizeAIResponse, parseJsonBlock, type AIReview } from "./common";
import type { DirectAIConfig } from "@/lib/ai/direct-config";
import type { SandboxReport, SourceFile } from "@/lib/types";

const cachedTokens = new Map<string, { token: string; expiresAt: number }>();

function getAuthUrl(): string {
  return process.env.GIGACHAT_AUTH_URL ?? "https://ngw.devices.sberbank.ru:9443/api/v2/oauth";
}
function getBaseUrl(): string {
  return (process.env.GIGACHAT_BASE_URL ?? "https://gigachat.devices.sberbank.ru/api/v1").replace(/\/$/, "");
}
function getModel(config?: DirectAIConfig): string {
  return config?.model?.trim() || process.env.GIGACHAT_MODEL || "GigaChat";
}
function getScope(): string {
  return process.env.GIGACHAT_SCOPE ?? "GIGACHAT_API_PERS";
}

export function isGigachatConfigured(config?: DirectAIConfig): boolean {
  // Разовый ключ: base64 Authorization key из кабинета GigaChat или пара client_id:client_secret.
  if (config?.apiKey && config.apiKey.length > 10) return true;
  return Boolean(
    (process.env.GIGACHAT_AUTH_KEY && process.env.GIGACHAT_AUTH_KEY.length > 10) ||
      (process.env.GIGACHAT_CLIENT_ID && process.env.GIGACHAT_CLIENT_SECRET),
  );
}

function buildAuthHeader(config?: DirectAIConfig): string | null {
  const directKey = config?.apiKey?.trim();
  if (directKey) {
    if (/^Basic\s+/i.test(directKey)) return directKey;
    if (directKey.includes(":")) return `Basic ${Buffer.from(directKey).toString("base64")}`;
    return `Basic ${directKey}`;
  }

  const clientId = process.env.GIGACHAT_CLIENT_ID;
  const clientSecret = process.env.GIGACHAT_CLIENT_SECRET;
  const authKey = process.env.GIGACHAT_AUTH_KEY;
  if (authKey) return `Basic ${authKey}`;
  if (clientId && clientSecret) return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
  return null;
}

async function getAccessToken(config?: DirectAIConfig): Promise<string | null> {
  const scope = getScope();
  const authHeader = buildAuthHeader(config);
  if (!authHeader) return null;

  const cacheKey = `${authHeader}:${scope}`;
  const cachedToken = cachedTokens.get(cacheKey);
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.token;
  }

  const rqUid = crypto.randomUUID();

  try {
    const res = await fetch(getAuthUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
        RqUID: rqUid,
        Authorization: authHeader,
      },
      body: new URLSearchParams({ scope }).toString(),
      // GigaChat использует самоподписанный сертификат — в Node нужно игнорировать проверку
      // Для Vercel: используем agent с rejectUnauthorized:false через fetch? Пока пробуем без.
    });

    if (!res.ok) {
      console.error("[gigachat] oauth HTTP", res.status, (await res.text()).slice(0, 800));
      return null;
    }
    const data = (await res.json()) as { access_token?: string; expires_at?: number; expires_in?: number };
    const token = data.access_token;
    if (!token) return null;
    const expiresIn = data.expires_at
      ? data.expires_at - Date.now()
      : (data.expires_in ?? 1800) * 1000;
    cachedTokens.set(cacheKey, { token, expiresAt: Date.now() + expiresIn });
    return token;
  } catch (e) {
    console.error("[gigachat] oauth failed", e);
    return null;
  }
}

export async function requestGigachatReview(params: {
  title: string;
  language: string;
  files: SourceFile[];
  sandbox: SandboxReport;
  aiConfig?: DirectAIConfig;
}): Promise<AIReview | null> {
  if (!isGigachatConfigured(params.aiConfig)) return null;
  const token = await getAccessToken(params.aiConfig);
  if (!token) return null;

  const userPrompt = buildUserPrompt(params);

  const body = {
    model: getModel(params.aiConfig),
    messages: [
      { role: "system", content: SINTEKSPROOF_SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.25,
    top_p: 0.9,
    max_tokens: 8192,
    repetition_penalty: 1,
    update_interval: 0,
  };

  const controller = new AbortController();
  const timeoutMs = params.aiConfig?.provider && params.aiConfig.provider !== "auto" ? 45_000 : 18_000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${getBaseUrl()}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      console.error("[gigachat] HTTP", res.status, (await res.text()).slice(0, 800));
      return null;
    }
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = json.choices?.[0]?.message?.content ?? "";
    if (!text.trim()) return null;
    const normalized = normalizeAIResponse(parseJsonBlock(text), params.files);
    normalized.findings = normalized.findings.map((f) => ({ ...f, origin: "gigachat" as const }));
    return normalized;
  } catch (e) {
    console.error("[gigachat] request failed", e);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export function getGigachatModelName(config?: DirectAIConfig): string {
  return getModel(config);
}
