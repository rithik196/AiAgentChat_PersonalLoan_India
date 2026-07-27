import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;

  if (!sessionId) {
    return NextResponse.json({ messages: [], session: null });
  }

  try {
    const response = await fetch(
      `${BACKEND_URL}/api/chat/history/${encodeURIComponent(sessionId)}`,
      { method: "GET", headers: { "Content-Type": "application/json" } }
    );

    if (!response.ok) {
      return NextResponse.json({ messages: [], session: null });
    }

    const data = await response.json();
    return NextResponse.json({
      messages: data.messages || [],
      session: data.session || null,
    });
  } catch {
    return NextResponse.json({ messages: [], session: null });
  }
}
