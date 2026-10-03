import { publicOrigin } from "@/lib/agentDocs";

export function GET(req: Request) {
  return Response.redirect(`${publicOrigin(req)}/mcp/server-card`, 301);
}
