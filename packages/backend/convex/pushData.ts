import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { deviceAlarm } from "./lib/validators";
import { toDeviceAlarm } from "./lib/alarms";

export const getPushTargets = internalQuery({
  args: { alarmId: v.id("alarms"), deviceIds: v.array(v.id("devices")) },
  returns: v.union(
    v.null(),
    v.object({
      alarm: deviceAlarm,
      targets: v.array(v.object({ deviceId: v.id("devices"), pushToken: v.string() })),
    }),
  ),
  handler: async (ctx, { alarmId, deviceIds }) => {
    const alarm = await ctx.db.get("alarms", alarmId);
    if (!alarm || alarm.status !== "ringing") return null;
    const targets = [];
    for (const deviceId of deviceIds) {
      const device = await ctx.db.get("devices", deviceId);
      if (device && device.revokedAt === undefined && device.pushToken) {
        targets.push({ deviceId, pushToken: device.pushToken });
      }
    }
    return { alarm: toDeviceAlarm(alarm), targets };
  },
});

export const recordPushResults = internalMutation({
  args: {
    alarmId: v.id("alarms"),
    delivered: v.array(v.id("devices")),
    invalidTokens: v.array(v.id("devices")),
  },
  returns: v.null(),
  handler: async (ctx, { alarmId, delivered, invalidTokens }) => {
    const now = Date.now();
    const deliveries = await ctx.db
      .query("deliveries")
      .withIndex("by_alarm", (q) => q.eq("alarmId", alarmId))
      .take(200);
    for (const delivery of deliveries) {
      if (delivered.includes(delivery.deviceId) && delivery.pushedAt === undefined) {
        await ctx.db.patch("deliveries", delivery._id, { pushedAt: now });
      }
    }
    for (const deviceId of invalidTokens) {
      await ctx.db.patch("devices", deviceId, { pushToken: undefined });
    }
    return null;
  },
});
