import { NextResponse } from "next/server";
import { publicHeaders, publicOrigin, robotsTxt } from "@/lib/agentDocs";

export function GET(req: Request) {
  return new NextResponse(robotsTxt(publicOrigin(req)), {
    headers: publicHeaders("text/plain; charset=utf-8"),
  });
}
