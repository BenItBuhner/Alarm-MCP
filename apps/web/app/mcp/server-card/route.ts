import { serverCard } from "@/lib/agentDocs";
import { corsOptions, jsonDoc } from "@/lib/publicDoc";

export function GET(req: Request) {
  return jsonDoc(req, serverCard, "application/mcp-server-card+json");
}

export const OPTIONS = corsOptions;
