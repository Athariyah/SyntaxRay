/**
 * СинтексПруф — минимальный JWT (HS256) для сессий.
 * Использует Web Crypto / Node crypto без внешних зависимостостей.
 */
import { createHmac } from "node:crypto";

function base64urlEncode(input: string | Buffer): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function base64urlDecode(input: string): string {
  const pad = 4 - (input.length % 4);
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/") + (pad < 4 ? "=".repeat(pad) : "");
  return Buffer.from(b64, "base64").toString();
}

function getSecret(): string {
  const s = process.env.NEXTAUTH_SECRET?.trim();
  if (s && s.length >= 16) return s;
  // Фолбэк для dev — не использовать в проде
  return "sinteksproof-dev-secret-please-set-NEXTAUTH_SECRET-32-chars";
}

export interface SessionPayload {
  userId: number;
  email?: string | null;
  name?: string | null;
  image?: string | null;
  provider?: string | null;
  exp: number; // seconds since epoch
  iat: number;
}

export function signSession(payload: Omit<SessionPayload, "exp" | "iat">, expiresInSec = 60 * 60 * 24 * 30): string {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const full: SessionPayload = { ...payload, iat: now, exp: now + expiresInSec };
  const encHeader = base64urlEncode(JSON.stringify(header));
  const encPayload = base64urlEncode(JSON.stringify(full));
  const data = `${encHeader}.${encPayload}`;
  const sig = base64urlEncode(createHmac("sha256", getSecret()).update(data).digest());
  return `${data}.${sig}`;
}

export function verifySession(token: string): SessionPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [encHeader, encPayload, sig] = parts;
    const data = `${encHeader}.${encPayload}`;
    const expected = base64urlEncode(createHmac("sha256", getSecret()).update(data).digest());
    if (sig !== expected) return null;
    const payload = JSON.parse(base64urlDecode(encPayload)) as SessionPayload;
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export const SESSION_COOKIE = "sinteksproof_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days
