import { describe, expect, test } from "vitest";
import { aiCatalog, llmsTxt, mcpUrl, serverCard, setupMd } from "./agentDocs";
import { ANDROID_APK_URL, RELEASE_TAG, WINDOWS_INSTALLER_URL } from "./downloads";

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
    expect(setup).toContain("Sign in with email");
    expect(setup).toContain("registers itself");
    expect(setup).toContain(`${origin}/download`);
  });

  test("download links point at GitHub release assets", () => {
    expect(RELEASE_TAG).toBe("v0.1.0");
    expect(WINDOWS_INSTALLER_URL).toContain(`/releases/download/${RELEASE_TAG}/Alarm-MCP-Setup-0.1.0.exe`);
    expect(ANDROID_APK_URL).toContain(`/releases/download/${RELEASE_TAG}/Alarm-MCP-0.1.0-android-debug.apk`);
  });

  test("server card and catalog point at streamable HTTP", () => {
    const card = serverCard(origin);
    expect(card.name).toBe("techlitnow.com/alarm-mcp");
    expect(card.remotes[0]).toMatchObject({ type: "streamable-http", url: mcp });
    expect(aiCatalog(origin).entries[0]?.url).toBe(`${origin}/mcp/server-card`);
  });
});
