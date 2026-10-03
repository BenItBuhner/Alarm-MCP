import { clerkClient } from "@clerk/nextjs/server";
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { mcpUserFromAuth, verifyBearer } from "@/lib/mcp/auth";
import { convexBackend, resolveApiKey } from "@/lib/mcp/convexBackend";
import { registerAlarmTools, SERVER_INSTRUCTIONS } from "@/lib/mcp/tools";

export const maxDuration = 60;

const mcpHandler = createMcpHandler(
  (server) => {
    registerAlarmTools(server, (authInfo) => {
      const user = mcpUserFromAuth(authInfo);
      return { user, backend: convexBackend(user) };
    });
  },
  {
    serverInfo: { name: "alarm-mcp", version: "0.1.0" },
    instructions: SERVER_INSTRUCTIONS,
  },
);

async function verifyOAuthToken(token: string) {
  try {
    const clerk = await clerkClient();
    const accessToken = await clerk.idPOAuthAccessToken.verify(token);
    if (accessToken.revoked || accessToken.expired) return null;
    return {
      userId: accessToken.subject,
      clientId: accessToken.clientId,
      scopes: accessToken.scopes,
      expiresAt: accessToken.expiration ?? undefined,
    };
  } catch {
    return null;
  }
}

const handler = withMcpAuth(
  mcpHandler,
  (_req, token) => verifyBearer(token, { resolveApiKey, verifyOAuthToken }),
  { required: true, resourceMetadataPath: "/.well-known/oauth-protected-resource/mcp" },
);

export { handler as GET, handler as POST, handler as DELETE };
