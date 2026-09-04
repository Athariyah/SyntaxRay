import { NextResponse } from "next/server";
import { getProviderStatus } from "@/lib/auth/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ providers: getProviderStatus() });
}
