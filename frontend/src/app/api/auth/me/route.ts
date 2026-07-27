import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get("raya_session")?.value;

  if (!token) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  // Decode the token to extract phone
  try {
    const decoded = Buffer.from(token, "base64url").toString();
    const [phone] = decoded.split(":");
    if (!phone) {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }
    return NextResponse.json({ authenticated: true, phone });
  } catch {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
}
