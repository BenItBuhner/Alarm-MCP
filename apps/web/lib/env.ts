function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

export const serverEnv = {
  convexUrl: () => required("NEXT_PUBLIC_CONVEX_URL"),
  mcpServerSecret: () => required("MCP_SERVER_SECRET"),
  clerkPublishableKey: () => required("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"),
};

/**
 * Clerk publishable keys encode the Frontend API host: pk_test_<base64("host$")>.
 * That host is the OAuth authorization server for MCP clients.
 */
export function clerkFrontendApiUrl(publishableKey: string): string {
  const encoded = publishableKey.split("_")[2];
  if (!encoded) throw new Error("Invalid Clerk publishable key");
  const host = atob(encoded).replace(/\$$/, "");
  return `https://${host}`;
}
