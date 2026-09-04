import { NextResponse } from "next/server";
import { getProvider, getBaseUrl } from "@/lib/auth/config";
import { exchangeCode, fetchUserInfo } from "@/lib/auth/oauth";
import { signSession, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/auth/jwt";
import { getDb } from "@/db";
import { users, accounts } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider: name } = await params;
  const provider = getProvider(name);
  if (!provider) {
    return NextResponse.json({ error: "Неизвестный провайдер" }, { status: 404 });
  }

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(`${getBaseUrl()}/login?error=${encodeURIComponent(error)}`);
  }
  if (!code) {
    return NextResponse.redirect(`${getBaseUrl()}/login?error=no_code`);
  }

  // Проверка state (если cookie есть)
  const cookieHeader = req.headers.get("cookie") ?? "";
  const stateCookie = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`oauth_state_${provider.name}=`))
    ?.split("=")[1];

  if (stateCookie && state && stateCookie !== state) {
    return NextResponse.redirect(`${getBaseUrl()}/login?error=state_mismatch`);
  }

  const tokenData = await exchangeCode(provider, code);
  if (!tokenData) {
    return NextResponse.redirect(`${getBaseUrl()}/login?error=token_exchange_failed`);
  }

  const profile = await fetchUserInfo(provider, tokenData.accessToken);
  if (!profile) {
    return NextResponse.redirect(`${getBaseUrl()}/login?error=userinfo_failed`);
  }

  // Найти или создать пользователя
  let userId: number;
  let userEmail = profile.email ?? null;
  let userName = profile.name ?? null;
  let userImage = profile.avatar ?? null;

  try {
    const db = await getDb();

    // Ищем по provider + providerAccountId
    const [existingAccount] = await db
      .select()
      .from(accounts)
      .where(and(eq(accounts.provider, provider.name), eq(accounts.providerAccountId, profile.id)))
      .limit(1);

    if (existingAccount) {
      userId = existingAccount.userId;
      // Обновляем токены
      await db
        .update(accounts)
        .set({
          accessToken: tokenData.accessToken,
          refreshToken: tokenData.refreshToken ?? null,
          expiresAt: tokenData.expiresIn ? Math.floor(Date.now() / 1000) + tokenData.expiresIn : null,
        })
        .where(eq(accounts.id, existingAccount.id));

      // Обновляем профиль пользователя если изменился
      const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (u) {
        await db
          .update(users)
          .set({
            name: userName ?? u.name,
            image: userImage ?? u.image,
            email: userEmail ?? u.email,
            updatedAt: new Date(),
          })
          .where(eq(users.id, userId));
      }
    } else {
      // Ищем по email или создаём нового
      let existingUser: typeof users.$inferSelect | undefined;
      if (userEmail) {
        const [byEmail] = await db.select().from(users).where(eq(users.email, userEmail)).limit(1);
        existingUser = byEmail;
      }

      if (existingUser) {
        userId = existingUser.id;
        await db
          .update(users)
          .set({
            name: userName ?? existingUser.name,
            image: userImage ?? existingUser.image,
            provider: provider.name,
            providerAccountId: profile.id,
            updatedAt: new Date(),
          })
          .where(eq(users.id, userId));
      } else {
        const [created] = await db
          .insert(users)
          .values({
            email: userEmail,
            name: userName ?? `Пользователь ${profile.id.slice(0, 6)}`,
            image: userImage,
            provider: provider.name,
            providerAccountId: profile.id,
          })
          .returning({ id: users.id });
        userId = created.id;
      }

      // Создаём account
      await db.insert(accounts).values({
        userId,
        provider: provider.name,
        providerAccountId: profile.id,
        accessToken: tokenData.accessToken,
        refreshToken: tokenData.refreshToken ?? null,
        expiresAt: tokenData.expiresIn ? Math.floor(Date.now() / 1000) + tokenData.expiresIn : null,
        tokenType: "Bearer",
        scope: provider.scope,
      });
    }
  } catch (e) {
    console.error("[auth:callback] db error", e);
    // Фолбэк: если БД недоступна, используем мок-id из профиля (хеш)
    userId = Math.abs(
      profile.id.split("").reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 0),
    );
  }

  const sessionToken = signSession({
    userId,
    email: userEmail,
    name: userName,
    image: userImage,
    provider: provider.name,
  });

  const redirectUrl = `${getBaseUrl()}/dashboard`;
  const res = NextResponse.redirect(redirectUrl);
  res.cookies.set(SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  // Очищаем state
  res.cookies.set(`oauth_state_${provider.name}`, "", { path: "/", maxAge: 0 });
  return res;
}
