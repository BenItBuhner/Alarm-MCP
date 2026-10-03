import { llmsTxt } from "@/lib/agentDocs";
import { corsOptions, markdownDoc } from "@/lib/publicDoc";

export function GET(req: Request) {
  return markdownDoc(req, llmsTxt);
}

export const OPTIONS = corsOptions;
