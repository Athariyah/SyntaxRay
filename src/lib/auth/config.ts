/**
 * СинтексПруф — конфигурация OAuth-провайдеров.
 * Поддерживает российские сервисы: Яндекс, VK, MAX, Госуслуги (ЕСИА).
 */

export type ProviderName = "yandex" | "vk" | "max" | "gosuslugi";

export interface OAuthProvider {
  name: ProviderName;
  label: string;
  color: string;
  icon: string;
  authorizeUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  scope: string;
  clientIdEnv: string;
  clientSecretEnv: string;
}

const providers: Record<ProviderName, OAuthProvider> = {
  yandex: {
    name: "yandex",
    label: "Яндекс",
    color: "#FC3F1D",
    icon: "Я",
    authorizeUrl: "https://oauth.yandex.ru/authorize",
    tokenUrl: "https://oauth.yandex.ru/token",
    userInfoUrl: "https://login.yandex.ru/info?format=json",
    scope: "login:email login:info login:avatar",
    clientIdEnv: "YANDEX_CLIENT_ID",
    clientSecretEnv: "YANDEX_CLIENT_SECRET",
  },
  vk: {
    name: "vk",
    label: "VK ID",
    color: "#07F",
    icon: "VK",
    authorizeUrl: "https://oauth.vk.com/authorize",
    tokenUrl: "https://oauth.vk.com/access_token",
    userInfoUrl: "https://api.vk.com/method/users.get",
    scope: "email",
    clientIdEnv: "VK_CLIENT_ID",
    clientSecretEnv: "VK_CLIENT_SECRET",
  },
  max: {
    name: "max",
    label: "MAX",
    color: "#00E676",
    icon: "M",
    authorizeUrl: process.env.MAX_AUTHORIZE_URL ?? "https://oauth.max.ru/authorize",
    tokenUrl: process.env.MAX_TOKEN_URL ?? "https://oauth.max.ru/token",
    userInfoUrl: process.env.MAX_USERINFO_URL ?? "https://oauth.max.ru/userinfo",
    scope: "profile",
    clientIdEnv: "MAX_CLIENT_ID",
    clientSecretEnv: "MAX_CLIENT_SECRET",
  },
  gosuslugi: {
    name: "gosuslugi",
    label: "Госуслуги",
    color: "#0D4CD3",
    icon: "ГУ",
    authorizeUrl:
      process.env.GOSUSLUGI_AUTHORIZE_URL ?? "https://esia.gosuslugi.ru/aas/oauth2/v3/authorize",
    tokenUrl: process.env.GOSUSLUGI_TOKEN_URL ?? "https://esia.gosuslugi.ru/aas/oauth2/v3/token",
    userInfoUrl:
      process.env.GOSUSLUGI_USERINFO_URL ?? "https://esia.gosuslugi.ru/rs/prns/1",
    scope: "openid fullname email",
    clientIdEnv: "GOSUSLUGI_CLIENT_ID",
    clientSecretEnv: "GOSUSLUGI_CLIENT_SECRET",
  },
};

export function getProvider(name: string): OAuthProvider | null {
  return (providers[name as ProviderName] ?? null) as OAuthProvider | null;
}

export function getAllProviders(): OAuthProvider[] {
  return Object.values(providers);
}

export function isProviderConfigured(provider: OAuthProvider): boolean {
  const id = process.env[provider.clientIdEnv]?.trim();
  const secret = process.env[provider.clientSecretEnv]?.trim();
  // Для демо-режима считаем настроенным даже без ключей — покажем мок
  // Чтобы скрыть ненастроенные, раскомментируйте проверку ниже:
  // return Boolean(id && secret);
  return true;
}

export function getProviderStatus() {
  return getAllProviders().map((p) => ({
    name: p.name,
    label: p.label,
    color: p.color,
    icon: p.icon,
    configured: Boolean(
      process.env[p.clientIdEnv]?.trim() && process.env[p.clientSecretEnv]?.trim(),
    ),
  }));
}

export function getBaseUrl(): string {
  if (process.env.NEXTAUTH_URL) return process.env.NEXTAUTH_URL.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL)
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return "http://localhost:3000";
}
