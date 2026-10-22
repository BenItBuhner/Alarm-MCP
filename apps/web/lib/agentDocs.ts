export function publicOrigin(req?: Request): string {
  if (process.env.MCP_PUBLIC_URL) return process.env.MCP_PUBLIC_URL.replace(/\/$/, "");
  if (req) return new URL(req.url).origin;
  return "https://alarm-mcp.techlitnow.com";
}

export function publicHeaders(contentType?: string): Record<string, string> {
  return {
    ...(contentType ? { "Content-Type": contentType } : {}),
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET",
    "Access-Control-Allow-Headers": "Content-Type, If-None-Match",
    "Access-Control-Expose-Headers": "ETag",
    "Cache-Control": "public, max-age=3600",
  };
}

export function mcpUrl(origin: string): string {
  return `${origin}/mcp`;
}

export function serverCard(origin: string) {
  const url = mcpUrl(origin);
  return {
    $schema: "https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json",
    name: "techlitnow.com/alarm-mcp",
    version: "0.1.0",
    title: "Alarm MCP",
    description: "Rings a signed-in phone, computer, or browser; Approve/Deny/Dismiss returns to the agent.",
    websiteUrl: origin,
    repository: { url: "https://github.com/BenItBuhner/Alarm-MCP", source: "github" },
    remotes: [
      {
        type: "streamable-http" as const,
        url,
        headers: [
          {
            name: "Authorization",
            description: "Clerk OAuth access token, or a dashboard API key (amk_…). OAuth is preferred.",
            isRequired: true,
            isSecret: true,
          },
        ],
      },
    ],
  };
}

export function aiCatalog(origin: string) {
  return {
    specVersion: "1.0",
    entries: [
      {
        identifier: "urn:air:techlitnow.com:mcp:alarm",
        type: "application/mcp-server-card+json",
        url: `${origin}/mcp/server-card`,
      },
    ],
  };
}

export function llmsTxt(origin: string): string {
  const mcp = mcpUrl(origin);
  return `# Alarm MCP

> Sign in with email on a device, connect an agent to ${mcp}, the agent rings the device, Approve/Deny/Dismiss returns to the agent.

If a user asked you to set this up, follow [Setup](${origin}/setup.md) and do not ask extra questions. Sign-up is email via Clerk. OAuth is the default MCP auth.

## Setup

- [Setup](${origin}/setup.md): Sign in with email, open a device, connect Cursor / Claude / Codex / ChatGPT.
- [Download](${origin}/download): Windows installer and Android APK.
- [Human page](${origin}/): Same loop in HTML.
- [Human page (markdown)](${origin}/index.md)

## Connect

- [MCP endpoint](${mcp}): Streamable HTTP. Clerk OAuth (DCR). API keys (\`amk_…\`) from the dashboard only if the client cannot do OAuth.
- [Server card](${origin}/mcp/server-card)
- [AI Catalog](${origin}/.well-known/ai-catalog.json)

## Tools

\`list_devices\`, \`create_alarm\`, \`get_alarm\` (\`wait_seconds\`), \`list_alarms\`, \`reschedule_alarm\`, \`cancel_alarm\`. Prompt: \`wake-me-when-done\`.

After \`create_alarm\` with \`response_options\`, call \`get_alarm\` with \`wait_seconds\` until the user answers. Do not ring devices unless they asked.
`;
}

export function setupMd(origin: string): string {
  const mcp = mcpUrl(origin);
  return `# Alarm MCP setup

Do this for the user. Ask almost nothing.

1. Open ${origin} and **Sign in with email**. Verify the Clerk email. Dashboard loads.
2. **Ready a device.** Use this browser on the dashboard, or install desktop/Android from ${origin}/download and sign in there. The device registers itself. No pairing code.
3. **Connect this agent** to ${mcp} (Streamable HTTP). Complete Clerk OAuth. If this client cannot do OAuth, the user creates an API key on the dashboard and you send \`Authorization: Bearer amk_…\`.

### Cursor

\`~/.cursor/mcp.json\` or project \`.cursor/mcp.json\`:

\`\`\`json
{ "mcpServers": { "alarm": { "url": "${mcp}" } } }
\`\`\`

### Claude Code

\`\`\`
claude mcp add --transport http alarm ${mcp}
\`\`\`

### Codex / generic JSON

\`\`\`json
{ "mcpServers": { "alarm": { "url": "${mcp}" } } }
\`\`\`

Without OAuth add \`"headers": { "Authorization": "Bearer amk_…" }\`.

### Claude / ChatGPT

Add a remote MCP / custom connector with ${mcp} and finish Clerk sign-in.

## Then use it

\`list_devices\`, then \`create_alarm\` from the user's words. For a decision, set \`response_options\` (e.g. \`["Approve","Deny"]\`) and poll \`get_alarm\` with \`wait_seconds\`. Dismiss counts as acknowledged.

Do not create alarms unless asked.
`;
}

export function indexMd(origin: string): string {
  const mcp = mcpUrl(origin);
  return `# Alarm MCP

An agent rings your phone or computer. You Approve, Deny, or Dismiss. The agent continues.

1. Sign in with email at ${origin}
2. Open this site, desktop, or Android — the device registers itself
3. Give an agent this site or ${mcp}

Then: “Wake me when you’re done.” Docs for agents: ${origin}/llms.txt
`;
}

export function robotsTxt(origin: string): string {
  return `User-agent: *
Allow: /

LLM-Context: ${origin}/llms.txt
`;
}
