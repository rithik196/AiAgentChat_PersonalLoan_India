import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";

export async function POST(req: Request) {
  let sessionId = "";
  try {
    const body = await req.json();
    sessionId = typeof body?.sessionId === "string" ? body.sessionId : "";
  } catch {
    sessionId = "";
  }

  if (sessionId) {
    try {
      await fetch(`${BACKEND_URL}/api/chat/history/${encodeURIComponent(sessionId)}`, {
        method: "DELETE",
      });
    } catch {
      // Logout should still clear the browser session even if cleanup is unavailable.
    }
  }

  const cookieStore = await cookies();
  cookieStore.delete("raya_session");

  return NextResponse.json({ success: true });
}
