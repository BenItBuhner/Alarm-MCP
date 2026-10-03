import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { action, internalMutation } from "./_generated/server";
import { activeDevices } from "./lib/alarms";
import {
  DEVICE_TOKEN_PREFIX,
  generatePairingCode,
  generateSecret,
  normalizePairingCode,
  sha256Hex,
} from "./lib/crypto";
import { userMutation, userQuery } from "./lib/functions";
import { fail } from "./lib/errors";
import { LIMITS } from "./lib/shared";
import { capabilities, deviceView, platform } from "./lib/validators";

export function toDeviceView(device: Doc<"devices">) {
  return {
    id: device._id,
    name: device.name,
    platform: device.platform,
    capabilities: device.capabilities,
    appVersion: device.appVersion,
    createdAt: device.createdAt,
    lastSeenAt: device.lastSeenAt,
    pushEnabled: device.pushToken !== undefined,
  };
}

export const list = userQuery({
  args: {},
  returns: v.array(deviceView),
  handler: async (ctx) => {
    if (!ctx.user) return [];
    return (await activeDevices(ctx, ctx.user._id)).map(toDeviceView);
  },
});

export const createPairingCode = userMutation({
  args: {},
  returns: v.object({ code: v.string(), expiresAt: v.number() }),
  handler: async (ctx) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("pairingCodes")
      .withIndex("by_user", (q) => q.eq("userId", ctx.user._id))
      .take(50);
    for (const old of existing) {
      if (old.usedAt === undefined) await ctx.db.delete("pairingCodes", old._id);
    }
    const code = generatePairingCode();
    const expiresAt = now + LIMITS.pairingCodeTtlMs;
    await ctx.db.insert("pairingCodes", { userId: ctx.user._id, code, expiresAt });
    return { code, expiresAt };
  },
});

export const rename = userMutation({
  args: { deviceId: v.id("devices"), name: v.string() },
  returns: v.null(),
  handler: async (ctx, { deviceId, name }) => {
    const device = await ctx.db.get("devices", deviceId);
    if (!device || device.userId !== ctx.user._id) fail("Device not found");
    const trimmed = name.trim().slice(0, 60);
    if (!trimmed) fail("Device name is required");
    await ctx.db.patch("devices", deviceId, { name: trimmed });
    return null;
  },
});

export const revoke = userMutation({
  args: { deviceId: v.id("devices") },
  returns: v.null(),
  handler: async (ctx, { deviceId }) => {
    const device = await ctx.db.get("devices", deviceId);
    if (!device || device.userId !== ctx.user._id) fail("Device not found");
    await ctx.db.patch("devices", deviceId, { revokedAt: Date.now(), pushToken: undefined });
    return null;
  },
});

export const completePairing = internalMutation({
  args: {
    code: v.string(),
    tokenHash: v.string(),
    name: v.string(),
    platform,
    capabilities,
    appVersion: v.optional(v.string()),
  },
  returns: v.object({ deviceId: v.id("devices"), userName: v.optional(v.string()) }),
  handler: async (ctx, args) => {
    const now = Date.now();
    const pairing = await ctx.db
      .query("pairingCodes")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .unique();
    if (!pairing || pairing.usedAt !== undefined || pairing.expiresAt < now) {
      fail("Pairing code is invalid or expired. Generate a new one from the dashboard.");
    }
    const user = await ctx.db.get("users", pairing.userId);
    if (!user) fail("Pairing code owner not found");

    const deviceId = await ctx.db.insert("devices", {
      userId: pairing.userId,
      name: args.name.trim().slice(0, 60) || `My ${args.platform}`,
      platform: args.platform,
      tokenHash: args.tokenHash,
      capabilities: args.capabilities,
      appVersion: args.appVersion,
      createdAt: now,
      lastSeenAt: now,
    });
    await ctx.db.patch("pairingCodes", pairing._id, { usedAt: now, deviceId });
    return { deviceId, userName: user.name };
  },
});

/** Called by a desktop/Android app with the code shown on the dashboard. */
export const pair = action({
  args: {
    code: v.string(),
    name: v.string(),
    platform,
    capabilities,
    appVersion: v.optional(v.string()),
  },
  returns: v.object({
    deviceId: v.id("devices"),
    deviceToken: v.string(),
    userName: v.optional(v.string()),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{ deviceId: Id<"devices">; deviceToken: string; userName?: string }> => {
    const deviceToken = generateSecret(DEVICE_TOKEN_PREFIX);
    const result: { deviceId: Id<"devices">; userName?: string } = await ctx.runMutation(internal.devices.completePairing, {
      ...args,
      code: normalizePairingCode(args.code),
      tokenHash: sha256Hex(deviceToken),
    });
    return { ...result, deviceToken };
  },
});
