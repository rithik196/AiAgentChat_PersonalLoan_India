import { NextRequest } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params;
  const query = req.nextUrl.search || "";

  try {
    const response = await fetch(
      `${BACKEND_URL}/api/chat/generated-documents/${encodeURIComponent(filename)}${query}`,
      { method: "GET" }
    );

    if (!response.ok) {
      return new Response("Document not found", { status: response.status });
    }

    const headers = new Headers();
    const contentType = response.headers.get("content-type");
    const contentDisposition = response.headers.get("content-disposition");
    const contentLength = response.headers.get("content-length");

    if (contentType) headers.set("content-type", contentType);
    if (contentDisposition) headers.set("content-disposition", contentDisposition);
    if (contentLength) headers.set("content-length", contentLength);
    headers.set("cache-control", "private, max-age=0, must-revalidate");

    return new Response(response.body, {
      status: response.status,
      headers,
    });
  } catch {
    return new Response("Failed to load document", { status: 500 });
  }
}
