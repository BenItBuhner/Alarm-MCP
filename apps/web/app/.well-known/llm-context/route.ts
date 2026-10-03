import { publicOrigin } from "@/lib/agentDocs";

export function GET(req: Request) {
  return Response.redirect(`${publicOrigin(req)}/llms.txt`, 302);
}
