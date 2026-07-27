import { NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const targetUrl = `${BACKEND_URL}/api/send_docusign_email`;
    console.log("[send_docusign_email proxy] target url:", targetUrl);
    console.log("[send_docusign_email proxy] request body:", body);

    const response = await fetch(targetUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const responseText = await response.text();
    console.log("[send_docusign_email proxy] backend status:", response.status, "body:", responseText);

    if (!response.ok) {
      return NextResponse.json({ error: responseText }, { status: 500 });
    }

    try {
      const data = JSON.parse(responseText);
      return NextResponse.json(data);
    } catch {
      return NextResponse.json({ raw: responseText });
    }
  } catch (error: unknown) {
    console.error("Failed to connect to backend send_docusign_email:", error);
    return NextResponse.json({ error: "Failed to connect to backend." }, { status: 500 });
  }
}
