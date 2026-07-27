import { NextResponse } from "next/server";

const BACKEND = process.env.BACKEND_URL ?? "http://localhost:8000";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const res = await fetch(`${BACKEND}/api/auth/send-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const raw = await res.text();
    let data: any;
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      data = { success: false, error: raw || "Failed to send OTP" };
    }

    if (!res.ok) {
      return NextResponse.json(
        { success: false, error: data.error ?? "Failed to send OTP" },
        { status: res.status || 500 }
      );
    }

    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Unable to reach backend auth service" },
      { status: 502 }
    );
  }
}
