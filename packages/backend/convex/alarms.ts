import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalMutation } from "./_generated/server";
import { louder } from "./lib/alarmLogic";
import {
  activeDevices,
  cancelAlarm,
  createAlarm,
  fireAlarm,
  getOwnedAlarm,
  pushAlarmTo,
  recentAlarms,
  ringExtraDevices,
  toAlarmView,
} from "./lib/alarms";
import { userMutation, userQuery } from "./lib/functions";
import { alarmSpecFields, alarmView } from "./lib/validators";

export const fire = internalMutation({
  args: { alarmId: v.id("alarms") },
  returns: v.null(),
  handler: async (ctx, { alarmId }) => {
    await fireAlarm(ctx, alarmId);
    return null;
  },
});

export const escalate = internalMutation({
  args: { alarmId: v.id("alarms") },
  returns: v.null(),
  handler: async (ctx, { alarmId }) => {
    const alarm = await ctx.db.get("alarms", alarmId);
    if (!alarm || alarm.status !== "ringing" || !alarm.escalation) return null;

    const intensity = louder(alarm.currentIntensity, alarm.escalation.toIntensity);
    const deliveries = await ctx.db
      .query("deliveries")
      .withIndex("by_alarm", (q) => q.eq("alarmId", alarmId))
      .take(200);
    const ringingDeviceIds = new Set<Id<"devices">>();
    for (const delivery of deliveries) {
      if (delivery.status !== "ringing") continue;
      ringingDeviceIds.add(delivery.deviceId);
      await ctx.db.patch("deliveries", delivery._id, { intensity });
    }

    if (alarm.escalation.expandToAllDevices) {
      const alreadyDelivered = new Set(deliveries.map((d) => d.deviceId));
      const extra = (await activeDevices(ctx, alarm.userId)).filter(
        (d) => !alreadyDelivered.has(d._id),
      );
      await ringExtraDevices(ctx, alarm, extra, intensity);
      extra.forEach((d) => ringingDeviceIds.add(d._id));
    }

    await ctx.db.patch("alarms", alarmId, {
      currentIntensity: intensity,
      escalateJobId: undefined,
    });
    await pushAlarmTo(ctx, alarmId, [...ringingDeviceIds]);
    return null;
  },
});

export const expire = internalMutation({
  args: { alarmId: v.id("alarms") },
  returns: v.null(),
  handler: async (ctx, { alarmId }) => {
    const alarm = await ctx.db.get("alarms", alarmId);
    if (!alarm || alarm.status !== "ringing") return null;
    const now = Date.now();
    const deliveries = await ctx.db
      .query("deliveries")
      .withIndex("by_alarm", (q) => q.eq("alarmId", alarmId))
      .take(200);
    for (const delivery of deliveries) {
      if (delivery.status === "ringing") {
        await ctx.db.patch("deliveries", delivery._id, { status: "expired", resolvedAt: now });
      }
    }
    if (alarm.escalateJobId) {
      const job = await ctx.db.system.get("_scheduled_functions", alarm.escalateJobId);
      if (job?.state.kind === "pending") await ctx.scheduler.cancel(alarm.escalateJobId);
    }
    await ctx.db.patch("alarms", alarmId, {
      status: "missed",
      resolvedAt: now,
      expireJobId: undefined,
      escalateJobId: undefined,
    });
    return null;
  },
});

export const listRecent = userQuery({
  args: { limit: v.optional(v.number()) },
  returns: v.array(alarmView),
  handler: async (ctx, { limit }) => {
    if (!ctx.user) return [];
    const alarms = await recentAlarms(ctx, ctx.user._id, Math.min(limit ?? 25, 100));
    return await Promise.all(alarms.map((a) => toAlarmView(ctx, a)));
  },
});

export const create = userMutation({
  args: alarmSpecFields,
  returns: v.id("alarms"),
  handler: async (ctx, spec) => {
    return await createAlarm(ctx, ctx.user, spec, { kind: "web", client: "dashboard" });
  },
});

export const cancel = userMutation({
  args: { alarmId: v.id("alarms") },
  returns: v.null(),
  handler: async (ctx, { alarmId }) => {
    const alarm = await getOwnedAlarm(ctx, ctx.user._id, alarmId);
    await cancelAlarm(ctx, alarm);
    return null;
  },
});
