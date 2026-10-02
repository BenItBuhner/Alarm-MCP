import type { DeviceAlarm } from "@alarm-mcp/backend/shared";
import { describe, expect, test } from "vitest";
import { backupsToArm, BACKUP_GRACE_MS, diffRinging, type OpenAlarm, windowModeFor } from "./alarmPlan";

function alarm(id: string, overrides: Partial<DeviceAlarm> = {}): DeviceAlarm {
  return {
    alarmId: id as DeviceAlarm["alarmId"],
    deliveryId: `d_${id}` as DeviceAlarm["deliveryId"],
    title: id,
    intensity: "normal",
    speak: false,
    vibrate: false,
    sound: "beacon",
    responseOptions: [],
    fireAt: 1000,
    maxRingSeconds: 60,
    ...overrides,
  };
}

describe("diffRinging", () => {
  test("opens new, updates escalated, closes acknowledged-elsewhere", () => {
    const shown = new Map<string, OpenAlarm>([
      ["a", { alarm: alarm("a"), local: false }],
      ["b", { alarm: alarm("b"), local: false }],
    ]);
    const diff = diffRinging(shown, [alarm("a", { intensity: "urgent" }), alarm("c")], new Set());
    expect(diff.open.map((a) => a.alarmId)).toEqual(["c"]);
    expect(diff.update.map((a) => a.alarmId)).toEqual(["a"]);
    expect(diff.close).toEqual(["b"]);
  });

  test("keeps local backups open while still upcoming, hands them over once the server rings", () => {
    const local = new Map<string, OpenAlarm>([["x", { alarm: alarm("x", { deliveryId: undefined }), local: true }]]);
    expect(diffRinging(local, [], new Set(["x"])).close).toEqual([]);
    expect(diffRinging(local, [], new Set()).close).toEqual(["x"]);
    expect(diffRinging(local, [alarm("x")], new Set()).update.map((a) => a.alarmId)).toEqual(["x"]);
  });
});

describe("backupsToArm", () => {
  test("arms alarms within 24h with a grace period", () => {
    const now = 0;
    const armed = backupsToArm([alarm("soon", { fireAt: 60_000 }), alarm("far", { fireAt: 2 * 86_400_000 })], now);
    expect(armed).toEqual([{ alarm: expect.objectContaining({ alarmId: "soon" }), delayMs: 60_000 + BACKUP_GRACE_MS }]);
  });
});

test("window mode follows intensity", () => {
  expect(windowModeFor("gentle")).toBe("corner");
  expect(windowModeFor("urgent")).toBe("fullscreen");
});
