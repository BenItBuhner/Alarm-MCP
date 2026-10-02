import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { computeFireAt, normalizeSpec } from "./lib/alarmLogic";
import { sha256Hex } from "./lib/crypto";

const modules = import.meta.glob("./**/*.ts");
const SECRET = "test-secret-0123456789abcdef0123456789abcdef";
const CLERK_ID = "user_test123";
const caps = { sound: true, vibrate: true, fullScreen: true, speak: true, actions: true };

function setup() {
  process.env.MCP_SERVER_SECRET = SECRET;
  const t = convexTest(schema, modules);
  const user = t.withIdentity({ subject: CLERK_ID, name: "Ada", email: "ada@example.com" });
  return { t, user };
}

async function pairDevice(
  ctx: ReturnType<typeof setup>,
  name: string,
  platform: "desktop" | "android",
) {
  const { code } = await ctx.user.mutation(api.devices.createPairingCode, {});
  return await ctx.t.action(api.devices.pair, {
    code: `${code.slice(0, 4).toLowerCase()}-${code.slice(4)}`,
    name,
    platform,
    capabilities: caps,
  });
}

/** Runs scheduled functions that are due now (fire, push), leaving future ones queued. */
async function runDue(t: ReturnType<typeof setup>["t"], ms = 1) {
  vi.advanceTimersByTime(ms);
  await t.finishInProgressScheduledFunctions();
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("pure helpers", () => {
  test("sha256 matches known vectors", () => {
    expect(sha256Hex("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
    expect(sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(sha256Hex("a".repeat(1000))).toBe(
      "41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3",
    );
  });

  test("computeFireAt handles all trigger kinds", () => {
    expect(computeFireAt({ kind: "now" }, 1000)).toBe(1000);
    expect(computeFireAt({ kind: "in", seconds: 90 }, 1000)).toBe(91_000);
    expect(computeFireAt({ kind: "at", at: 5000 }, 1000)).toBe(5000);
    expect(() => computeFireAt({ kind: "at", at: 0 }, 10_000_000)).toThrow(/past/);
    expect(() => computeFireAt({ kind: "in", seconds: 60 * 60 * 24 * 31 }, 0)).toThrow(/30 days/);
  });

  test("normalizeSpec applies intensity defaults and validates", () => {
    const gentle = normalizeSpec({
      title: "  Build done ",
      trigger: { kind: "now" },
      targets: { kind: "all" },
      intensity: "gentle",
    });
    expect(gentle).toMatchObject({ title: "Build done", sound: "chime", vibrate: false, maxRingSeconds: 120 });
    expect(() =>
      normalizeSpec({
        title: "x",
        trigger: { kind: "now" },
        targets: { kind: "all" },
        intensity: "normal",
        escalation: { afterSeconds: 400, toIntensity: "urgent", expandToAllDevices: false },
      }),
    ).toThrow(/shorter than maxRingSeconds/);
  });
});

describe("pairing", () => {
  test("pairing code is single use and yields a working device token", async () => {
    const ctx = setup();
    const { code } = await ctx.user.mutation(api.devices.createPairingCode, {});
    const paired = await ctx.t.action(api.devices.pair, {
      code,
      name: "Pixel 9",
      platform: "android",
      capabilities: caps,
    });
    expect(paired.deviceToken.startsWith("amd_")).toBe(true);
    await expect(
      ctx.t.action(api.devices.pair, { code, name: "again", platform: "android", capabilities: caps }),
    ).rejects.toThrow(/invalid or expired/);

    const feed = await ctx.t.query(api.deviceApi.feed, { deviceToken: paired.deviceToken });
    expect(feed.device.name).toBe("Pixel 9");
    expect(await ctx.user.query(api.devices.list, {})).toHaveLength(1);

    await ctx.user.mutation(api.devices.revoke, { deviceId: paired.deviceId });
    await expect(
      ctx.t.query(api.deviceApi.feed, { deviceToken: paired.deviceToken }),
    ).rejects.toThrow(/revoked/);
  });

  test("expired pairing codes are rejected", async () => {
    const ctx = setup();
    const { code } = await ctx.user.mutation(api.devices.createPairingCode, {});
    vi.advanceTimersByTime(11 * 60 * 1000);
    await expect(
      ctx.t.action(api.devices.pair, { code, name: "late", platform: "desktop", capabilities: caps }),
    ).rejects.toThrow(/invalid or expired/);
  });
});

describe("agent → device → agent loop", () => {
  test("permission prompt: gentle alarm on phone, user approves, agent sees response", async () => {
    const ctx = setup();
    const phone = await pairDevice(ctx, "Pixel 9", "android");
    const laptop = await pairDevice(ctx, "Work MacBook", "desktop");

    const created = await ctx.t.mutation(api.mcp.createAlarmForAgent, {
      serverSecret: SECRET,
      clerkUserId: CLERK_ID,
      client: "claude-code",
      title: "Agent blocked on a permission prompt",
      message: "Allow `rm -rf build/`?",
      objective: "softly wake me up if you're blocked by permissions",
      trigger: { kind: "now" },
      targets: { kind: "devices", selectors: ["my phone"] },
      intensity: "gentle",
      responseOptions: ["Approve", "Deny"],
    });
    expect(created.status).toBe("scheduled");
    expect(created.targetDeviceNames).toEqual(["Pixel 9"]);

    await runDue(ctx.t);

    const phoneFeed = await ctx.t.query(api.deviceApi.feed, { deviceToken: phone.deviceToken });
    expect(phoneFeed.ringing).toHaveLength(1);
    expect(phoneFeed.ringing[0]).toMatchObject({ intensity: "gentle", responseOptions: ["Approve", "Deny"] });
    const laptopFeed = await ctx.t.query(api.deviceApi.feed, { deviceToken: laptop.deviceToken });
    expect(laptopFeed.ringing).toHaveLength(0);

    await expect(
      ctx.t.mutation(api.deviceApi.respond, {
        deviceToken: phone.deviceToken,
        alarmId: created.id,
        action: "respond",
        option: "Maybe",
      }),
    ).rejects.toThrow(/not one of/);

    await ctx.t.mutation(api.deviceApi.respond, {
      deviceToken: phone.deviceToken,
      alarmId: created.id,
      action: "respond",
      option: "Approve",
    });

    const after = await ctx.t.query(api.mcp.getAlarm, {
      serverSecret: SECRET,
      clerkUserId: CLERK_ID,
      alarmId: created.id,
    });
    expect(after.status).toBe("acknowledged");
    expect(after.response).toMatchObject({ action: "respond", option: "Approve", deviceName: "Pixel 9" });
    expect(after.deliveries[0]?.status).toBe("acknowledged");
    const cleared = await ctx.t.query(api.deviceApi.feed, { deviceToken: phone.deviceToken });
    expect(cleared.ringing).toHaveLength(0);
  });

  test("acknowledging on one device silences the others", async () => {
    const ctx = setup();
    const phone = await pairDevice(ctx, "Pixel", "android");
    const laptop = await pairDevice(ctx, "Laptop", "desktop");
    const alarm = await ctx.t.mutation(api.mcp.createAlarmForAgent, {
      serverSecret: SECRET,
      clerkUserId: CLERK_ID,
      title: "Training run finished",
      trigger: { kind: "now" },
      targets: { kind: "all" },
      intensity: "normal",
    });
    await runDue(ctx.t);
    await ctx.t.mutation(api.deviceApi.respond, {
      deviceToken: laptop.deviceToken,
      alarmId: alarm.id,
      action: "dismiss",
    });
    const view = await ctx.t.query(api.mcp.getAlarm, {
      serverSecret: SECRET,
      clerkUserId: CLERK_ID,
      alarmId: alarm.id,
    });
    const byName = Object.fromEntries(view.deliveries.map((d) => [d.deviceName, d.status]));
    expect(byName).toEqual({ Pixel: "silenced", Laptop: "acknowledged" });
    expect((await ctx.t.query(api.deviceApi.feed, { deviceToken: phone.deviceToken })).ringing).toHaveLength(0);
  });

  test("unmatched device names produce a helpful error", async () => {
    const ctx = setup();
    await pairDevice(ctx, "Pixel", "android");
    await expect(
      ctx.t.mutation(api.mcp.createAlarmForAgent, {
        serverSecret: SECRET,
        clerkUserId: CLERK_ID,
        title: "x",
        trigger: { kind: "now" },
        targets: { kind: "devices", selectors: ["smart fridge"] },
        intensity: "normal",
      }),
    ).rejects.toThrow(/Could not match device\(s\) "smart fridge"\. Available devices: "Pixel" \(android\)/);
  });

  test("escalation raises intensity and expands to all devices, then expiry marks missed", async () => {
    const ctx = setup();
    const phone = await pairDevice(ctx, "Pixel", "android");
    const laptop = await pairDevice(ctx, "Laptop", "desktop");
    const alarm = await ctx.t.mutation(api.mcp.createAlarmForAgent, {
      serverSecret: SECRET,
      clerkUserId: CLERK_ID,
      title: "Deploy failed",
      trigger: { kind: "now" },
      targets: { kind: "devices", selectors: ["laptop"] },
      intensity: "gentle",
      escalation: { afterSeconds: 30, toIntensity: "urgent", expandToAllDevices: true },
      maxRingSeconds: 60,
    });
    await runDue(ctx.t);
    expect((await ctx.t.query(api.deviceApi.feed, { deviceToken: phone.deviceToken })).ringing).toHaveLength(0);

    await runDue(ctx.t, 30_000);
    const phoneFeed = await ctx.t.query(api.deviceApi.feed, { deviceToken: phone.deviceToken });
    const laptopFeed = await ctx.t.query(api.deviceApi.feed, { deviceToken: laptop.deviceToken });
    expect(phoneFeed.ringing[0]?.intensity).toBe("urgent");
    expect(laptopFeed.ringing[0]?.intensity).toBe("urgent");

    await runDue(ctx.t, 30_000);
    const view = await ctx.t.query(api.mcp.getAlarm, {
      serverSecret: SECRET,
      clerkUserId: CLERK_ID,
      alarmId: alarm.id,
    });
    expect(view.status).toBe("missed");
    expect(view.deliveries.every((d) => d.status === "expired")).toBe(true);
  });

  test("scheduled alarms show as upcoming, can be snoozed, rescheduled and cancelled", async () => {
    const ctx = setup();
    const phone = await pairDevice(ctx, "Pixel", "android");
    const alarm = await ctx.t.mutation(api.mcp.createAlarmForAgent, {
      serverSecret: SECRET,
      clerkUserId: CLERK_ID,
      title: "Dead man's switch",
      trigger: { kind: "in", seconds: 3600 },
      targets: { kind: "all" },
      intensity: "urgent",
    });
    const feed = await ctx.t.query(api.deviceApi.feed, { deviceToken: phone.deviceToken });
    expect(feed.upcoming.map((a) => a.alarmId)).toEqual([alarm.id]);

    const pushed = await ctx.t.mutation(api.mcp.rescheduleAlarmForAgent, {
      serverSecret: SECRET,
      clerkUserId: CLERK_ID,
      alarmId: alarm.id,
      trigger: { kind: "in", seconds: 7200 },
    });
    expect(pushed.fireAt - Date.now()).toBe(7_200_000);

    await runDue(ctx.t, 7_200_000);
    expect((await ctx.t.query(api.deviceApi.feed, { deviceToken: phone.deviceToken })).ringing).toHaveLength(1);

    await ctx.t.mutation(api.deviceApi.respond, {
      deviceToken: phone.deviceToken,
      alarmId: alarm.id,
      action: "snooze",
      snoozeMinutes: 10,
    });
    let view = await ctx.t.query(api.mcp.getAlarm, {
      serverSecret: SECRET,
      clerkUserId: CLERK_ID,
      alarmId: alarm.id,
    });
    expect(view).toMatchObject({ status: "scheduled", snoozeCount: 1, response: { action: "snooze" } });

    view = await ctx.t.mutation(api.mcp.cancelAlarmForAgent, {
      serverSecret: SECRET,
      clerkUserId: CLERK_ID,
      alarmId: alarm.id,
    });
    expect(view.status).toBe("cancelled");
    await runDue(ctx.t, 20 * 60 * 1000);
    expect((await ctx.t.query(api.deviceApi.feed, { deviceToken: phone.deviceToken })).ringing).toHaveLength(0);
  });
});

describe("server auth and API keys", () => {
  test("rejects a wrong server secret", async () => {
    const ctx = setup();
    await expect(
      ctx.t.query(api.mcp.listDevices, { serverSecret: "nope", clerkUserId: CLERK_ID }),
    ).rejects.toThrow(/invalid server secret/);
  });

  test("API keys resolve to their owner until revoked", async () => {
    const ctx = setup();
    const { id, key } = await ctx.user.action(api.apiKeys.create, { name: "Cursor" });
    expect(key.startsWith("amk_")).toBe(true);
    expect(
      await ctx.t.mutation(api.mcp.resolveApiKey, { serverSecret: SECRET, apiKey: key }),
    ).toEqual({ clerkUserId: CLERK_ID });
    await ctx.user.mutation(api.apiKeys.revoke, { apiKeyId: id });
    expect(
      await ctx.t.mutation(api.mcp.resolveApiKey, { serverSecret: SECRET, apiKey: key }),
    ).toBeNull();
  });

  test("dashboard functions require sign-in", async () => {
    const ctx = setup();
    await expect(ctx.t.mutation(api.devices.createPairingCode, {})).rejects.toThrow(/Not authenticated/);
  });
});
