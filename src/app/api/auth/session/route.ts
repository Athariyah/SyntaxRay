import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const data = await getCurrentUser();
  if (!data) {
    return NextResponse.json({ user: null, session: null });
  }
  const { session, user } = data;
  return NextResponse.json({
    user: user
      ? { id: user.id, email: user.email, name: user.name, image: user.image, provider: user.provider }
      : { id: session.userId, email: session.email, name: session.name, image: session.image, provider: session.provider },
    session: { expires: new Date(session.exp * 1000).toISOString() },
  });
}
