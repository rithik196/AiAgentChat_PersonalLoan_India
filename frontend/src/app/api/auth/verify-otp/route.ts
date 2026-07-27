import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const BACKEND = process.env.BACKEND_URL ?? "http://localhost:8000";

export async function POST(req: Request) {
  const body = await req.json();

  const res = await fetch(`${BACKEND}/api/auth/verify-otp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    credentials: "include",
  });

  const raw = await res.text();
  let data: any;
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = { success: false, error: raw || "Verification failed" };
  }

  if (!res.ok || !data.success) {
    return NextResponse.json(
      { success: false, error: data.error ?? "Verification failed" },
      { status: 401 }
    );
  }

  // Forward the session cookie set by the backend
  const setCookieHeader = res.headers.get("set-cookie");
  const response = NextResponse.json({ success: true, phone: data.phone });

  if (setCookieHeader) {
    response.headers.set("set-cookie", setCookieHeader);
  } else {
    // Fallback: set our own session cookie mirroring the backend token logic
    const cookieStore = await cookies();
    const token = Buffer.from(`${data.phone}:${Date.now()}`).toString("base64url");
    cookieStore.set("raya_session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24,
    });
  }

  return response;
}
