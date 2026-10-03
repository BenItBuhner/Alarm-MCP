import { describe, expect, test } from "vitest";
import { aiCatalog, llmsTxt, mcpUrl, serverCard, setupMd } from "./agentDocs";

const origin = "https://alarm-mcp.techlitnow.com";
const mcp = mcpUrl(origin);

describe("agent setup docs", () => {
  test("llms.txt and setup.md tell an agent how to finish setup", () => {
    const llms = llmsTxt(origin);
    expect(llms.startsWith("# Alarm MCP\n")).toBe(true);
    expect(llms).toContain(`${origin}/setup.md`);
    expect(llms).toContain(mcp);
    const setup = setupMd(origin);
    expect(setup).toContain("claude mcp add --transport http alarm");
    expect(setup).toContain(`"url": "${mcp}"`);
    expect(setup).toContain("Sign up with email");
    expect(setup).toContain("Pair a device");
  });

  test("server card and catalog point at streamable HTTP", () => {
    const card = serverCard(origin);
    expect(card.name).toBe("techlitnow.com/alarm-mcp");
    expect(card.remotes[0]).toMatchObject({ type: "streamable-http", url: mcp });
    expect(aiCatalog(origin).entries[0]?.url).toBe(`${origin}/mcp/server-card`);
  });
});
