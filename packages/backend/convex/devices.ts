import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { action, internalMutation } from "./_generated/server";
import { activeDevices } from "./lib/alarms";
import { DEVICE_TOKEN_PREFIX, generateSecret, sha256Hex } from "./lib/crypto";
import { fail } from "./lib/errors";
import { ensureUser, userMutation, userQuery } from "./lib/functions";
import { capabilities, deviceView, intensity, platform } from "./lib/validators";

export function toDeviceView(device: Doc<"devices">) {
  return {
    id: device._id,
    name: device.name,
    platform: device.platform,
    capabilities: device.capabilities,
    defaultIntensity: device.defaultIntensity,
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

export const setDefaultIntensity = userMutation({
  args: { deviceId: v.id("devices"), defaultIntensity: intensity },
  returns: v.null(),
  handler: async (ctx, { deviceId, defaultIntensity }) => {
    const device = await ctx.db.get("devices", deviceId);
    if (!device || device.userId !== ctx.user._id) fail("Device not found");
    await ctx.db.patch("devices", deviceId, { defaultIntensity });
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

const registerArgs = {
  installationId: v.string(),
  name: v.string(),
  platform,
  capabilities,
  appVersion: v.optional(v.string()),
  defaultIntensity: v.optional(intensity),
};

/**
 * Called by a signed-in desktop, Android, or browser client. Upserts this
 * installation onto the Clerk user and returns a long-lived device token for
 * the alarm feed (Clerk sessions expire; alarms still have to ring).
 */
export const register = action({
  args: registerArgs,
  returns: v.object({
    deviceId: v.id("devices"),
    deviceToken: v.string(),
    userName: v.optional(v.string()),
    created: v.boolean(),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{
    deviceId: Id<"devices">;
    deviceToken: string;
    userName?: string;
    created: boolean;
  }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) fail("Not authenticated");
    const installationId = args.installationId.trim().slice(0, 80);
    if (!installationId) fail("installationId is required");
    const deviceToken = generateSecret(DEVICE_TOKEN_PREFIX);
    const result: { deviceId: Id<"devices">; userName?: string; created: boolean } =
      await ctx.runMutation(internal.devices.completeRegister, {
        clerkId: identity.subject,
        profileName: identity.name ?? undefined,
        profileEmail: identity.email ?? undefined,
        tokenHash: sha256Hex(deviceToken),
        installationId,
        name: args.name,
        platform: args.platform,
        capabilities: args.capabilities,
        appVersion: args.appVersion,
        defaultIntensity: args.defaultIntensity,
      });
    return { ...result, deviceToken };
  },
});

export const completeRegister = internalMutation({
  args: {
    clerkId: v.string(),
    profileName: v.optional(v.string()),
    profileEmail: v.optional(v.string()),
    tokenHash: v.string(),
    installationId: v.string(),
    name: v.string(),
    platform,
    capabilities,
    appVersion: v.optional(v.string()),
    defaultIntensity: v.optional(intensity),
  },
  returns: v.object({
    deviceId: v.id("devices"),
    userName: v.optional(v.string()),
    created: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const user = await ensureUser(ctx, args.clerkId, {
      name: args.profileName,
      email: args.profileEmail,
    });
    const now = Date.now();
    const name = args.name.trim().slice(0, 60) || `My ${args.platform}`;
    const existing = await ctx.db
      .query("devices")
      .withIndex("by_user_and_installation", (q) =>
        q.eq("userId", user._id).eq("installationId", args.installationId),
      )
      .unique();

    if (existing) {
      await ctx.db.patch("devices", existing._id, {
        name,
        platform: args.platform,
        tokenHash: args.tokenHash,
        capabilities: args.capabilities,
        appVersion: args.appVersion,
        defaultIntensity: args.defaultIntensity ?? existing.defaultIntensity,
        lastSeenAt: now,
        revokedAt: undefined,
      });
      return { deviceId: existing._id, userName: user.name, created: false };
    }

    const deviceId = await ctx.db.insert("devices", {
      userId: user._id,
      name,
      platform: args.platform,
      tokenHash: args.tokenHash,
      installationId: args.installationId,
      capabilities: args.capabilities,
      appVersion: args.appVersion,
      defaultIntensity: args.defaultIntensity,
      createdAt: now,
      lastSeenAt: now,
    });
    return { deviceId, userName: user.name, created: true };
  },
});
