import { v } from "convex/values";
import { toDeviceView } from "./devices";
import {
  activeDevices,
  cancelAlarm,
  createAlarm,
  getOwnedAlarm,
  recentAlarms,
  rescheduleAlarm,
  toAlarmView,
} from "./lib/alarms";
import { sha256Hex } from "./lib/crypto";
import { serverMutation, serverOnlyMutation, serverQuery } from "./lib/functions";
import { fail } from "./lib/errors";
import { alarmSpecFields, alarmStatus, alarmView, deviceView, trigger } from "./lib/validators";

// Functions called by the hosted MCP server (apps/web) after it authenticated the user.
// Every call carries MCP_SERVER_SECRET and the Clerk user id.

export const resolveApiKey = serverOnlyMutation({
  args: { apiKey: v.string() },
  returns: v.union(v.null(), v.object({ clerkUserId: v.string() })),
  handler: async (ctx, { apiKey }) => {
    const key = await ctx.db
      .query("apiKeys")
      .withIndex("by_key_hash", (q) => q.eq("keyHash", sha256Hex(apiKey)))
      .unique();
    if (!key || key.revokedAt !== undefined) return null;
    const user = await ctx.db.get("users", key.userId);
    if (!user) return null;
    const now = Date.now();
    if (!key.lastUsedAt || now - key.lastUsedAt > 60_000) {
      await ctx.db.patch("apiKeys", key._id, { lastUsedAt: now });
    }
    return { clerkUserId: user.clerkId };
  },
});

export const listDevices = serverQuery({
  args: {},
  returns: v.array(deviceView),
  handler: async (ctx) => {
    if (!ctx.user) return [];
    return (await activeDevices(ctx, ctx.user._id)).map(toDeviceView);
  },
});

export const createAlarmForAgent = serverMutation({
  args: { ...alarmSpecFields, client: v.optional(v.string()) },
  returns: alarmView,
  handler: async (ctx, { client, ...spec }) => {
    const alarmId = await createAlarm(ctx, ctx.user, spec, { kind: "mcp", client });
    const alarm = await ctx.db.get("alarms", alarmId);
    if (!alarm) fail("Alarm vanished after creation");
    return await toAlarmView(ctx, alarm);
  },
});

export const getAlarm = serverQuery({
  args: { alarmId: v.string() },
  returns: alarmView,
  handler: async (ctx, { alarmId }) => {
    if (!ctx.user) fail(`Alarm not found: ${alarmId}`);
    return await toAlarmView(ctx, await getOwnedAlarm(ctx, ctx.user._id, alarmId));
  },
});

export const listAlarms = serverQuery({
  args: { status: v.optional(alarmStatus), limit: v.optional(v.number()) },
  returns: v.array(alarmView),
  handler: async (ctx, { status, limit }) => {
    if (!ctx.user) return [];
    const take = Math.min(Math.max(limit ?? 10, 1), 50);
    const userId = ctx.user._id;
    const alarms = status
      ? await ctx.db
          .query("alarms")
          .withIndex("by_user_and_status", (q) => q.eq("userId", userId).eq("status", status))
          .order("desc")
          .take(take)
      : await recentAlarms(ctx, userId, take);
    return await Promise.all(alarms.map((a) => toAlarmView(ctx, a)));
  },
});

export const cancelAlarmForAgent = serverMutation({
  args: { alarmId: v.string() },
  returns: alarmView,
  handler: async (ctx, { alarmId }) => {
    const alarm = await getOwnedAlarm(ctx, ctx.user._id, alarmId);
    await cancelAlarm(ctx, alarm);
    return await toAlarmView(ctx, (await ctx.db.get("alarms", alarm._id)) ?? alarm);
  },
});

export const rescheduleAlarmForAgent = serverMutation({
  args: { alarmId: v.string(), trigger },
  returns: alarmView,
  handler: async (ctx, { alarmId, trigger }) => {
    const alarm = await getOwnedAlarm(ctx, ctx.user._id, alarmId);
    await rescheduleAlarm(ctx, alarm, trigger);
    return await toAlarmView(ctx, (await ctx.db.get("alarms", alarm._id)) ?? alarm);
  },
});
