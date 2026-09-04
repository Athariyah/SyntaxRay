/**
 * СинтексПруф — OAuth хелперы для Яндекс / VK / MAX / Госуслуги.
 */
import { getProvider, getBaseUrl, type OAuthProvider } from "./config";

export function getRedirectUri(provider: OAuthProvider): string {
  return `${getBaseUrl()}/api/auth/callback/${provider.name}`;
}

export function buildAuthorizeUrl(provider: OAuthProvider, state: string): string {
  const clientId = process.env[provider.clientIdEnv]?.trim() ?? "demo-client-id";
  const redirectUri = getRedirectUri(provider);
  const url = new URL(provider.authorizeUrl);

  if (provider.name === "yandex") {
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("scope", provider.scope);
    url.searchParams.set("state", state);
    url.searchParams.set("force_confirm", "yes");
  } else if (provider.name === "vk") {
    // VK OAuth classic
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("scope", provider.scope);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("v", "5.131");
    url.searchParams.set("state", state);
    url.searchParams.set("display", "page");
  } else if (provider.name === "max") {
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("scope", provider.scope);
    url.searchParams.set("state", state);
  } else if (provider.name === "gosuslugi") {
    // ЕСИА (упрощённый, без ГОСТ)
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("client_secret", process.env[provider.clientSecretEnv] ?? "");
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("scope", provider.scope);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("state", state);
    url.searchParams.set("access_type", "offline");
  }

  return url.toString();
}

export async function exchangeCode(
  provider: OAuthProvider,
  code: string,
): Promise<{ accessToken: string; refreshToken?: string; expiresIn?: number; idToken?: string } | null> {
  const clientId = process.env[provider.clientIdEnv]?.trim();
  const clientSecret = process.env[provider.clientSecretEnv]?.trim();
  const redirectUri = getRedirectUri(provider);

  // Демо-режим: если ключи не заданы — возвращаем мок-токен
  if (!clientId || !clientSecret) {
    console.warn(`[oauth:${provider.name}] демо-режим — ключи не заданы, использую мок-токен`);
    return { accessToken: `demo_${provider.name}_${code.slice(0, 8)}`, expiresIn: 3600 };
  }

  try {
    if (provider.name === "yandex") {
      const res = await fetch(provider.tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          client_id: clientId,
          client_secret: clientSecret,
        }).toString(),
      });
      if (!res.ok) {
        console.error(`[oauth:yandex] token HTTP ${res.status}`, (await res.text()).slice(0, 500));
        return null;
      }
      const data = (await res.json()) as { access_token?: string; refresh_token?: string; expires_in?: number };
      return data.access_token ? { accessToken: data.access_token, refreshToken: data.refresh_token, expiresIn: data.expires_in } : null;
    }

    if (provider.name === "vk") {
      const res = await fetch(
        `${provider.tokenUrl}?${new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          code,
        }).toString()}`,
      );
      if (!res.ok) {
        console.error(`[oauth:vk] token HTTP ${res.status}`, (await res.text()).slice(0, 500));
        return null;
      }
      const data = (await res.json()) as { access_token?: string; expires_in?: number; user_id?: number; email?: string };
      return data.access_token ? { accessToken: data.access_token, expiresIn: data.expires_in } : null;
    }

    // MAX и Госуслуги — generic OAuth2
    const res = await fetch(provider.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
      }).toString(),
    });
    if (!res.ok) {
      console.error(`[oauth:${provider.name}] token HTTP ${res.status}`, (await res.text()).slice(0, 500));
      return null;
    }
    const data = (await res.json()) as { access_token?: string; refresh_token?: string; expires_in?: number; id_token?: string };
    return data.access_token ? { accessToken: data.access_token, refreshToken: data.refresh_token, expiresIn: data.expires_in, idToken: data.id_token } : null;
  } catch (e) {
    console.error(`[oauth:${provider.name}] exchange failed`, e);
    return null;
  }
}

export async function fetchUserInfo(
  provider: OAuthProvider,
  accessToken: string,
): Promise<{ id: string; email?: string | null; name?: string | null; avatar?: string | null } | null> {
  // Демо
  const clientId = process.env[provider.clientIdEnv]?.trim();
  const clientSecret = process.env[provider.clientSecretEnv]?.trim();
  if (!clientId || !clientSecret) {
    const suffix = accessToken.slice(-4);
    return {
      id: `demo_${provider.name}_${suffix}`,
      email: `demo_${suffix}@${provider.name}.local`,
      name: `Демо ${provider.label} ${suffix}`,
      avatar: null,
    };
  }

  try {
    if (provider.name === "yandex") {
      const res = await fetch(provider.userInfoUrl, {
        headers: { Authorization: `OAuth ${accessToken}` },
      });
      if (!res.ok) return null;
      const d = (await res.json()) as { id?: string; default_email?: string; display_name?: string; real_name?: string; default_avatar_id?: string };
      return {
        id: String(d.id ?? ""),
        email: d.default_email,
        name: d.display_name || d.real_name || `Yandex ${d.id}`,
        avatar: d.default_avatar_id ? `https://avatars.yandex.net/get-yapic/${d.default_avatar_id}/islands-200` : null,
      };
    }

    if (provider.name === "vk") {
      // VK требует user_ids и access_token
      const res = await fetch(
        `https://api.vk.com/method/users.get?${new URLSearchParams({
          access_token: accessToken,
          v: "5.131",
          fields: "photo_200,email",
        }).toString()}`,
      );
      if (!res.ok) return null;
      const j = (await res.json()) as { response?: Array<{ id: number; first_name: string; last_name: string; photo_200?: string }> };
      const u = j.response?.[0];
      return u
        ? {
            id: String(u.id),
            name: `${u.first_name} ${u.last_name}`.trim(),
            avatar: u.photo_200 ?? null,
          }
        : null;
    }

    // Generic
    const res = await fetch(provider.userInfoUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      console.error(`[oauth:${provider.name}] userinfo HTTP ${res.status}`);
      return null;
    }
    const d = (await res.json()) as Record<string, unknown>;
    return {
      id: String(d.sub ?? d.id ?? d.oid ?? d.user_id ?? `uid_${accessToken.slice(0, 6)}`),
      email: (d.email as string) ?? (d.emails as string[])?.[0],
      name: (d.name as string) ?? (d.fullname as string) ?? (d.displayName as string) ?? `${provider.label} user`,
      avatar: (d.picture as string) ?? (d.avatar as string) ?? null,
    };
  } catch (e) {
    console.error(`[oauth:${provider.name}] userinfo failed`, e);
    return null;
  }
}

export function createState(): string {
  return Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
}
