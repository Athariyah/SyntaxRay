import { NextResponse } from "next/server";
import { getProvider } from "@/lib/auth/config";
import { buildAuthorizeUrl, createState } from "@/lib/auth/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider: name } = await params;
  const provider = getProvider(name);
  if (!provider) {
    return NextResponse.json({ error: "Неизвестный провайдер" }, { status: 404 });
  }

  const state = createState();
  const url = buildAuthorizeUrl(provider, state);

  const res = NextResponse.redirect(url);
  // state cookie for CSRF — 10 min
  res.cookies.set(`oauth_state_${provider.name}`, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
