import { indexMd } from "@/lib/agentDocs";
import { corsOptions, markdownDoc } from "@/lib/publicDoc";

export function GET(req: Request) {
  return markdownDoc(req, indexMd);
}

export const OPTIONS = corsOptions;
