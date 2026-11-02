import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Liveness + config probe. Does not leak secret values. */
export async function GET() {
  return NextResponse.json({
    ok: true,
    app: process.env.NEXT_PUBLIC_APP_NAME ?? "laundriroom",
    database_configured: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    time: new Date().toISOString(),
  });
}
