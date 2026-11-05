import { NextResponse, type NextRequest } from "next/server";
import { unsubscribe } from "@/app/unsubscribe/actions";

/**
 * One-click unsubscribe (RFC 8058): email apps POST here from the
 * List-Unsubscribe header every newsletter carries. A GET just shows the page.
 */
export async function POST(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("t") ?? "";
  const r = await unsubscribe(token);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export function GET(req: NextRequest) {
  const url = req.nextUrl.clone();
  url.pathname = "/unsubscribe";
  return NextResponse.redirect(url);
}
