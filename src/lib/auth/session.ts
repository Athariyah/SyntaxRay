/**
 * СинтексПруф — получение сессии из cookies (server-only).
 */
import { cookies } from "next/headers";
import { verifySession, SESSION_COOKIE, type SessionPayload } from "./jwt";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySession(token);
}

export async function getCurrentUser() {
  const session = await getSession();
  if (!session) return null;
  try {
    const db = await getDb();
    const [user] = await db.select().from(users).where(eq(users.id, session.userId)).limit(1);
    return user ? { session, user } : null;
  } catch {
    // Если БД недоступна — возвращаем payload из JWT
    return { session, user: null as unknown as typeof users.$inferSelect };
  }
}

export function isAuthenticated(session: SessionPayload | null): boolean {
  return Boolean(session && session.userId);
}
