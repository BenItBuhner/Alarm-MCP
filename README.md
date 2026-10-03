# Alarm MCP

An agent rings your phone or computer. You Approve, Deny, or Dismiss. The agent continues.

Live: https://alarm-mcp.techlitnow.com  
MCP: https://alarm-mcp.techlitnow.com/mcp  
Agents: https://alarm-mcp.techlitnow.com/llms.txt

## Setup

1. Sign up with email at the site.
2. Pair this device (desktop and/or Android) from the dashboard.
3. Give an agent the site or MCP URL. OAuth via Clerk. API keys (`amk_…`) only if the client cannot do OAuth.

Desktop, from this repo: `pnpm install && pnpm --filter @alarm-mcp/desktop dist` (or `dev`).  
Android: `cd apps/android && ./gradlew :app:assembleDebug`.

### Cursor

```json
{ "mcpServers": { "alarm": { "url": "https://alarm-mcp.techlitnow.com/mcp" } } }
```

### Claude Code

```
claude mcp add --transport http alarm https://alarm-mcp.techlitnow.com/mcp
```

Then: “Wake me when you’re done.” Full agent playbook: https://alarm-mcp.techlitnow.com/setup.md
