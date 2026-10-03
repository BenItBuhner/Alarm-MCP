import { NextResponse } from "next/server";
import { publicHeaders, publicOrigin } from "./agentDocs";

export function markdownDoc(req: Request, body: (origin: string) => string): NextResponse {
  return new NextResponse(body(publicOrigin(req)), {
    headers: publicHeaders("text/markdown; charset=utf-8"),
  });
}

export function jsonDoc(req: Request, body: (origin: string) => unknown, contentType: string): NextResponse {
  return new NextResponse(JSON.stringify(body(publicOrigin(req))), {
    headers: publicHeaders(contentType),
  });
}

export function corsOptions(): NextResponse {
  return new NextResponse(null, { status: 204, headers: publicHeaders() });
}
