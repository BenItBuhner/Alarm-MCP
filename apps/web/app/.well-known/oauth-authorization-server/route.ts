import { metadataCorsOptionsRequestHandler } from "mcp-handler";
import { clerkFrontendApiUrl, serverEnv } from "@/lib/env";

// For older MCP clients that look for authorization server metadata on the resource origin.
export async function GET(): Promise<Response> {
  const issuer = clerkFrontendApiUrl(serverEnv.clerkPublishableKey());
  const upstream = await fetch(`${issuer}/.well-known/oauth-authorization-server`, {
    next: { revalidate: 3600 },
  });
  return new Response(await upstream.text(), {
    status: upstream.status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=3600",
    },
  });
}

export const OPTIONS = metadataCorsOptionsRequestHandler();
