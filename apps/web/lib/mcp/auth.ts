import type { AuthInfo } from "@modelcontextprotocol/server";
import type { McpUser } from "./backend";

export const API_KEY_PREFIX = "amk_";

export type TokenVerifiers = {
  resolveApiKey: (apiKey: string) => Promise<string | null>;
  verifyOAuthToken: (
    token: string,
  ) => Promise<{ userId: string; clientId: string; scopes: string[]; expiresAt?: number } | null>;
};

/**
 * Accepts either a personal API key (amk_…) or a Clerk-issued OAuth access token.
 * Returns undefined for anything else so withMcpAuth answers 401 with a
 * WWW-Authenticate challenge pointing clients at the OAuth flow.
 */
export async function verifyBearer(
  token: string | undefined,
  verifiers: TokenVerifiers,
): Promise<AuthInfo | undefined> {
  if (!token) return undefined;
  if (token.startsWith(API_KEY_PREFIX)) {
    const clerkUserId = await verifiers.resolveApiKey(token);
    if (!clerkUserId) return undefined;
    return {
      token,
      clientId: `api-key:${token.slice(0, 10)}`,
      scopes: [],
      extra: { clerkUserId },
    };
  }
  const verified = await verifiers.verifyOAuthToken(token);
  if (!verified) return undefined;
  return {
    token,
    clientId: verified.clientId,
    scopes: verified.scopes,
    expiresAt: verified.expiresAt,
    extra: { clerkUserId: verified.userId },
  };
}

export function mcpUserFromAuth(authInfo: AuthInfo | undefined): McpUser {
  const clerkUserId = authInfo?.extra?.clerkUserId;
  if (!authInfo || typeof clerkUserId !== "string") {
    throw new Error("Unauthorized: missing authenticated user");
  }
  return { clerkUserId, client: authInfo.clientId };
}
