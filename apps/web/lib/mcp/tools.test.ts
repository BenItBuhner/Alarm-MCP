import type { AlarmView, DeviceView } from "@alarm-mcp/backend/shared";
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { describe, expect, test } from "vitest";
import { mcpUserFromAuth, verifyBearer } from "./auth";
import type { AlarmBackend } from "./backend";
import { parseWhen, registerAlarmTools, SERVER_INSTRUCTIONS } from "./tools";

const device: DeviceView = {
  id: "dev_phone" as DeviceView["id"],
  name: "Pixel 9",
  platform: "android",
  capabilities: { sound: true, vibrate: true, fullScreen: true, speak: true, actions: true },
  createdAt: 0,
  lastSeenAt: Date.now(),
  pushEnabled: true,
};

function fakeBackend(log: unknown[]) {
  const alarms = new Map<string, AlarmView>();
  let polls = 0;
  const backend: AlarmBackend = {
    listDevices: async () => [device],
    createAlarm: async (spec) => {
      log.push(spec);
      const alarm: AlarmView = {
        id: `alarm_${alarms.size + 1}` as AlarmView["id"],
        title: spec.title,
        message: spec.message,
        objective: spec.objective,
        source: { kind: "mcp", client: spec.client },
        status: "ringing",
        intensity: spec.intensity,
        currentIntensity: spec.intensity,
        speak: false,
        vibrate: true,
        sound: "chime",
        maxRingSeconds: 120,
        responseOptions: spec.responseOptions ?? [],
        fireAt: Date.now(),
        createdAt: Date.now(),
        snoozeCount: 0,
        targetMode: spec.targets.kind,
        targetDeviceNames: spec.targets.kind === "all" ? [] : ["Pixel 9"],
        deliveries: [],
      };
      alarms.set(alarm.id, alarm);
      return alarm;
    },
    getAlarm: async (id) => {
      const alarm = alarms.get(id);
      if (!alarm) throw new Error(`Alarm not found: ${id}`);
      polls++;
      if (polls >= 2 && alarm.responseOptions.length > 0) {
        return {
          ...alarm,
          status: "acknowledged",
          response: { action: "respond", option: "Approve", deviceName: "Pixel 9", at: Date.now() },
        };
      }
      return alarm;
    },
    listAlarms: async () => [...alarms.values()],
    cancelAlarm: async (id) => ({ ...alarms.get(id)!, status: "cancelled" }),
    rescheduleAlarm: async (id) => alarms.get(id)!,
  };
  return backend;
}

function buildHandler(log: unknown[]) {
  const backend = fakeBackend(log);
  const mcp = createMcpHandler(
    (server) =>
      registerAlarmTools(server, (authInfo) => ({ user: mcpUserFromAuth(authInfo), backend }), {
        pollIntervalMs: 5,
      }),
    { serverInfo: { name: "alarm-mcp", version: "test" }, instructions: SERVER_INSTRUCTIONS },
  );
  return withMcpAuth(
    mcp,
    (_req, token) =>
      verifyBearer(token, {
        resolveApiKey: async (key) => (key === "amk_good" ? "user_1" : null),
        verifyOAuthToken: async (t) =>
          t === "oauth_good" ? { userId: "user_1", clientId: "claude", scopes: ["profile"] } : null,
      }),
    { required: true, resourceMetadataPath: "/.well-known/oauth-protected-resource/mcp" },
  );
}

let nextId = 1;
async function rpc(
  handler: (req: Request) => Promise<Response>,
  method: string,
  params: Record<string, unknown>,
  token = "oauth_good",
) {
  const res = await handler(
    new Request("https://alarm.example/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        Authorization: `Bearer ${token}`,
        "MCP-Protocol-Version": "2025-06-18",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: nextId++, method, params }),
    }),
  );
  const text = await res.text();
  const payload = text.trimStart().startsWith("{")
    ? text
    : text
        .split("\n")
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trim())
        .pop() ?? "";
  return { status: res.status, headers: res.headers, body: payload ? JSON.parse(payload) : null };
}

const init = {
  protocolVersion: "2025-06-18",
  capabilities: {},
  clientInfo: { name: "vitest", version: "1" },
};

describe("MCP endpoint", () => {
  test("rejects missing/invalid tokens with an OAuth challenge", async () => {
    const handler = buildHandler([]);
    const res = await rpc(handler, "initialize", init, "bad");
    expect(res.status).toBe(401);
    expect(res.headers.get("WWW-Authenticate")).toContain("/.well-known/oauth-protected-resource/mcp");
  });

  test("lists tools and the wake-me prompt", async () => {
    const handler = buildHandler([]);
    const initRes = await rpc(handler, "initialize", init);
    expect(initRes.status).toBe(200);
    expect(initRes.body.result.instructions).toContain("Wake me when you're done");
    const tools = await rpc(handler, "tools/list", {});
    expect(tools.body.result.tools.map((t: { name: string }) => t.name).sort()).toEqual([
      "cancel_alarm",
      "create_alarm",
      "get_alarm",
      "list_alarms",
      "list_devices",
      "reschedule_alarm",
    ]);
    const prompts = await rpc(handler, "prompts/list", {});
    expect(prompts.body.result.prompts[0].name).toBe("wake-me-when-done");
  });

  test("create_alarm maps natural options and get_alarm waits for the answer (API key auth)", async () => {
    const log: unknown[] = [];
    const handler = buildHandler(log);
    const created = await rpc(
      handler,
      "tools/call",
      {
        name: "create_alarm",
        arguments: {
          title: "Need permission",
          objective: "softly wake me up if you're blocked by permissions",
          devices: ["my phone"],
          intensity: "gentle",
          escalate_after_seconds: 60,
          response_options: ["Approve", "Deny"],
        },
      },
      "amk_good",
    );
    expect(created.body.result.isError).toBeFalsy();
    expect(log[0]).toMatchObject({
      trigger: { kind: "now" },
      targets: { kind: "devices", selectors: ["my phone"] },
      intensity: "gentle",
      escalation: { afterSeconds: 60, toIntensity: "urgent", expandToAllDevices: false },
      client: "api-key:amk_good",
    });
    const alarmId = created.body.result.structuredContent.alarm.id;

    const waited = await rpc(
      handler,
      "tools/call",
      { name: "get_alarm", arguments: { alarm_id: alarmId, wait_seconds: 5 } },
      "amk_good",
    );
    expect(waited.body.result.structuredContent.alarm.status).toBe("acknowledged");
    expect(waited.body.result.content[0].text).toContain('responded "Approve"');
  });

  test("backend errors come back as tool errors", async () => {
    const handler = buildHandler([]);
    const res = await rpc(handler, "tools/call", { name: "get_alarm", arguments: { alarm_id: "nope" } });
    expect(res.body.result.isError).toBe(true);
    expect(res.body.result.content[0].text).toBe("Error: Alarm not found: nope");
  });
});

describe("parseWhen", () => {
  test("requires explicit offsets and rejects ambiguity", () => {
    expect(parseWhen({})).toEqual({ kind: "now" });
    expect(parseWhen({ in_seconds: 30 })).toEqual({ kind: "in", seconds: 30 });
    expect(parseWhen({ fire_at: "2026-10-02T07:00:00-07:00" })).toEqual({
      kind: "at",
      at: Date.parse("2026-10-02T14:00:00Z"),
    });
    expect(() => parseWhen({ fire_at: "2026-10-02T07:00:00" })).toThrow(/UTC offset/);
    expect(() => parseWhen({ fire_at: "x", in_seconds: 1 })).toThrow(/not both/);
  });
});
