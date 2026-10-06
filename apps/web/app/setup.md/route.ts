import { setupMd } from "@/lib/agentDocs";
import { corsOptions, markdownDoc } from "@/lib/publicDoc";

export function GET(req: Request) {
  return markdownDoc(req, setupMd);
}

export const OPTIONS = corsOptions;
