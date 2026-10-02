import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { louder } from "./lib/alarmLogic";
import {
  activeDevices,
  cancelAlarm,
  createAlarm,
  getOwnedAlarm,
  recentAlarms,
  toAlarmView,
} from "./lib/alarms";
import { userMutation, userQuery } from "./lib/functions";
import { alarmSpecFields, alarmView, type Intensity } from "./lib/validators";

async function ring(
  ctx: MutationCtx,
  alarm: Doc<"alarms">,
  devices: Doc<"devices">[],
  intensity: Intensity,
): Promise<void> {
  const now = Date.now();
  for (const device of devices) {
    await ctx.db.insert("deliveries", {
      alarmId: alarm._id,
      userId: alarm.userId,
      deviceId: device._id,
      status: "ringing",
      intensity,
      createdAt: now,
    });
  }
}

async function pushTo(ctx: MutationCtx, alarmId: Id<"alarms">, deviceIds: Id<"devices">[]) {
  if (deviceIds.length === 0) return;
  await ctx.scheduler.runAfter(0, internal.push.sendAlarm, { alarmId, deviceIds });
}

export const fire = internalMutation({
  args: { alarmId: v.id("alarms") },
  returns: v.null(),
  handler: async (ctx, { alarmId }) => {
    const alarm = await ctx.db.get("alarms", alarmId);
    if (!alarm || alarm.status !== "scheduled") return null;

    const devices = (await activeDevices(ctx, alarm.userId)).filter(
      (d) => alarm.targetMode === "all" || alarm.targetDeviceIds.includes(d._id),
    );
    const now = Date.now();
    if (devices.length === 0) {
      await ctx.db.patch("alarms", alarmId, {
        status: "missed",
        firedAt: now,
        resolvedAt: now,
        fireJobId: undefined,
      });
      return null;
    }

    await ring(ctx, alarm, devices, alarm.currentIntensity);
    const expireJobId = await ctx.scheduler.runAfter(
      alarm.maxRingSeconds * 1000,
      internal.alarms.expire,
      { alarmId },
    );
    const escalateJobId = alarm.escalation
      ? await ctx.scheduler.runAfter(
          alarm.escalation.afterSeconds * 1000,
          internal.alarms.escalate,
          { alarmId },
        )
      : undefined;
    await ctx.db.patch("alarms", alarmId, {
      status: "ringing",
      firedAt: now,
      fireJobId: undefined,
      expireJobId,
      escalateJobId,
    });
    await pushTo(ctx, alarmId, devices.map((d) => d._id));
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
      await ring(ctx, alarm, extra, intensity);
      extra.forEach((d) => ringingDeviceIds.add(d._id));
    }

    await ctx.db.patch("alarms", alarmId, {
      currentIntensity: intensity,
      escalateJobId: undefined,
    });
    await pushTo(ctx, alarmId, [...ringingDeviceIds]);
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
