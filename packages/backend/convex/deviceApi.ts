import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import {
  acknowledgeAlarm,
  alarmTargetsDevice,
  getOwnedAlarm,
  rescheduleAlarm,
  toDeviceAlarm,
} from "./lib/alarms";
import { deviceMutation, deviceQuery } from "./lib/functions";
import { fail } from "./lib/errors";
import { LIMITS } from "./lib/shared";
import { capabilities, deviceAlarm, platform } from "./lib/validators";

/**
 * Live feed for a paired device: alarms ringing on it right now, plus upcoming
 * scheduled alarms it should arm locally as an offline backup.
 */
export const feed = deviceQuery({
  args: {},
  returns: v.object({
    device: v.object({ id: v.id("devices"), name: v.string(), platform }),
    ringing: v.array(deviceAlarm),
    upcoming: v.array(deviceAlarm),
  }),
  handler: async (ctx) => {
    const deliveries = await ctx.db
      .query("deliveries")
      .withIndex("by_device_and_status", (q) =>
        q.eq("deviceId", ctx.device._id).eq("status", "ringing"),
      )
      .take(20);
    const ringing = [];
    for (const delivery of deliveries) {
      const alarm = await ctx.db.get("alarms", delivery.alarmId);
      if (alarm?.status === "ringing") ringing.push(toDeviceAlarm(alarm, delivery));
    }

    const scheduled: Doc<"alarms">[] = await ctx.db
      .query("alarms")
      .withIndex("by_user_and_status", (q) =>
        q.eq("userId", ctx.user._id).eq("status", "scheduled"),
      )
      .take(LIMITS.activeAlarmsPerUser);
    const upcoming = scheduled
      .filter((a) => alarmTargetsDevice(a, ctx.device._id))
      .sort((a, b) => a.fireAt - b.fireAt)
      .slice(0, 25)
      .map((a) => toDeviceAlarm(a));

    return {
      device: { id: ctx.device._id, name: ctx.device.name, platform: ctx.device.platform },
      ringing,
      upcoming,
    };
  },
});

export const heartbeat = deviceMutation({
  args: {
    pushToken: v.optional(v.union(v.string(), v.null())),
    appVersion: v.optional(v.string()),
    capabilities: v.optional(capabilities),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch("devices", ctx.device._id, {
      lastSeenAt: Date.now(),
      ...(args.pushToken !== undefined ? { pushToken: args.pushToken ?? undefined } : {}),
      ...(args.appVersion ? { appVersion: args.appVersion } : {}),
      ...(args.capabilities ? { capabilities: args.capabilities } : {}),
    });
    return null;
  },
});

export const markSeen = deviceMutation({
  args: { deliveryId: v.id("deliveries") },
  returns: v.null(),
  handler: async (ctx, { deliveryId }) => {
    const delivery = await ctx.db.get("deliveries", deliveryId);
    if (!delivery || delivery.deviceId !== ctx.device._id) fail("Delivery not found");
    if (delivery.seenAt === undefined) {
      await ctx.db.patch("deliveries", deliveryId, { seenAt: Date.now() });
    }
    return null;
  },
});

export const respond = deviceMutation({
  args: {
    alarmId: v.id("alarms"),
    action: v.union(v.literal("dismiss"), v.literal("respond"), v.literal("snooze")),
    option: v.optional(v.string()),
    snoozeMinutes: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, { alarmId, action, option, snoozeMinutes }) => {
    const alarm = await getOwnedAlarm(ctx, ctx.user._id, alarmId);
    if (!alarmTargetsDevice(alarm, ctx.device._id)) {
      const delivered = await ctx.db
        .query("deliveries")
        .withIndex("by_alarm", (q) => q.eq("alarmId", alarmId))
        .take(200);
      if (!delivered.some((d) => d.deviceId === ctx.device._id)) {
        fail("This alarm was not sent to this device");
      }
    }
    if (action === "snooze") {
      const minutes = Math.min(Math.max(snoozeMinutes ?? 5, 1), LIMITS.snoozeMinutesMax);
      await rescheduleAlarm(ctx, alarm, { kind: "in", seconds: minutes * 60 }, ctx.device._id);
      return null;
    }
    await acknowledgeAlarm(ctx, alarm, { action, option, deviceId: ctx.device._id });
    return null;
  },
});

export const unpair = deviceMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await ctx.db.patch("devices", ctx.device._id, {
      revokedAt: Date.now(),
      pushToken: undefined,
    });
    return null;
  },
});
