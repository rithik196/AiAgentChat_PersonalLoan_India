import { cookies } from "next/headers";
import { NextResponse } from "next/server";

// In-memory user store (for demo — replace with DB for production)
const USER_STORE = new Map<string, { phone: string; loggedInAt: number }>();

export async function POST(req: Request) {
  const { phone } = await req.json();

  if (!phone || typeof phone !== "string") {
    return NextResponse.json({ error: "Phone number required" }, { status: 400 });
  }

  // Clean phone number
  const cleaned = phone.replace(/\s/g, "").replace(/^\+966/, "");

  // Create session token (simple base64 of phone + timestamp for demo)
  const token = Buffer.from(`${cleaned}:${Date.now()}`).toString("base64url");

  USER_STORE.set(token, { phone: cleaned, loggedInAt: Date.now() });

  // Set HTTP-only cookie
  const cookieStore = await cookies();
  cookieStore.set("raya_session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24, // 24 hours
  });

  return NextResponse.json({ ok: true, phone: cleaned });
}
