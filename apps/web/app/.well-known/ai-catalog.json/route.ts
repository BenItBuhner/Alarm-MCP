import { aiCatalog } from "@/lib/agentDocs";
import { corsOptions, jsonDoc } from "@/lib/publicDoc";

export function GET(req: Request) {
  return jsonDoc(req, aiCatalog, "application/ai-catalog+json");
}

export const OPTIONS = corsOptions;
