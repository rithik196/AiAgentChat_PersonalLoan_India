import { cookies } from "next/headers";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";

type ChatMessage = {
  role: string;
  content?: string;
  parts?: Array<{ text?: string }>;
};

type ChatRequestBody = {
  messages?: ChatMessage[];
  sessionId?: string;
  session?: Record<string, unknown>;
  [key: string]: unknown;
};

export async function POST(req: Request) {
  const body = (await req.json()) as ChatRequestBody;
  const messages = Array.isArray(body.messages) ? body.messages : [];
  console.log("[chat proxy] incoming request body keys:", Object.keys(body || {}));

  // Derive session ID from auth cookie (phone-based) + chatId
  const cookieStore = await cookies();
  const token = cookieStore.get("raya_session")?.value;
  let phone = "anonymous";
  if (token) {
    try {
      const decoded = Buffer.from(token, "base64url").toString();
      phone = decoded.split(":")[0] || "anonymous";
    } catch { /* use anonymous */ }
  }
  // Get sessionId from header (most reliable), body, or derive from Referer
  let sessionId = req.headers.get("x-session-id") || body.sessionId;
  if (!sessionId) {
    const referer = req.headers.get("referer") || "";
    const urlMatch = referer.match(/\/([a-z_]+)\/?$/);
    const product = urlMatch ? urlMatch[1] : "default";
    sessionId = `${phone}_${product}`;
  }
  console.log("[chat proxy] resolved session:", sessionId, "messageCount:", messages?.length ?? 0);

  // Format messages for backend. Keep internal __SYS__ markers so the backend can
  // route widget events deterministically instead of treating them like free text.
  const formattedMessages = messages.map((m) => {
    const contentFromParts = m.parts?.map((p) => p.text).filter(Boolean).join("") ?? "";
    const content = m.content || contentFromParts;
    return { role: m.role, content };
  });

  try {
    // Proxy to backend API gateway
    const response = await fetch(`${BACKEND_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: sessionId,
        messages: formattedMessages,
        session: body.session,
      }),
    });
    console.log("[chat proxy] backend response status:", response.status);

    if (!response.ok) {
      const err = await response.text();
      console.error("[chat proxy] backend error body:", err);
      return new Response("Backend error: " + err, { status: 500 });
    }

    // Stream SSE response through to client
    return new Response(response.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "x-vercel-ai-ui-message-stream": "v1",
      },
    });
  } catch (error: unknown) {
    console.error("Failed to connect to backend:", error);
    return new Response("Failed to connect to backend.", { status: 500 });
  }
}
