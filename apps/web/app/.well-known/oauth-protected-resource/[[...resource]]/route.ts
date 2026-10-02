import { metadataCorsOptionsRequestHandler, protectedResourceHandler } from "mcp-handler";
import { clerkFrontendApiUrl, serverEnv } from "@/lib/env";

// Served at both /.well-known/oauth-protected-resource and .../mcp (RFC 9728 path-suffixed form).
export function GET(req: Request): Response {
  const origin = new URL(req.url).origin;
  return protectedResourceHandler({
    authServerUrls: [clerkFrontendApiUrl(serverEnv.clerkPublishableKey())],
    resourceUrl: `${process.env.MCP_PUBLIC_URL ?? origin}/mcp`,
  })(req);
}

export const OPTIONS = metadataCorsOptionsRequestHandler();
