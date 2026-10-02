import {
  customMutation,
  customQuery,
} from "convex-helpers/server/customFunctions";
import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import { sha256Hex, timingSafeEqual } from "./crypto";

export async function getUserByClerkId(
  ctx: QueryCtx,
  clerkId: string,
): Promise<Doc<"users"> | null> {
  return await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkId))
    .unique();
}

export async function ensureUser(
  ctx: MutationCtx,
  clerkId: string,
  profile: { name?: string; email?: string } = {},
): Promise<Doc<"users">> {
  const existing = await getUserByClerkId(ctx, clerkId);
  if (existing) {
    if (
      (profile.name && profile.name !== existing.name) ||
      (profile.email && profile.email !== existing.email)
    ) {
      await ctx.db.patch("users", existing._id, {
        name: profile.name ?? existing.name,
        email: profile.email ?? existing.email,
      });
    }
    return existing;
  }
  const userId = await ctx.db.insert("users", {
    clerkId,
    name: profile.name,
    email: profile.email,
    createdAt: Date.now(),
  });
  const user = await ctx.db.get("users", userId);
  if (!user) throw new Error("Failed to create user");
  return user;
}

/** Signed-in dashboard user (Clerk JWT). `ctx.user` is null until `users.ensure` has run. */
export const userQuery = customQuery(query, {
  args: {},
  input: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const user = await getUserByClerkId(ctx, identity.subject);
    return { ctx: { user }, args: {} };
  },
});

/** Signed-in dashboard user (Clerk JWT); the user row is created on first use. */
export const userMutation = customMutation(mutation, {
  args: {},
  input: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const user = await ensureUser(ctx, identity.subject, {
      name: identity.name ?? undefined,
      email: identity.email ?? undefined,
    });
    return { ctx: { user }, args: {} };
  },
});

function assertServerSecret(provided: string): void {
  const expected = process.env.MCP_SERVER_SECRET;
  if (!expected || expected.length < 32) {
    throw new Error("Server misconfigured: MCP_SERVER_SECRET is not set (min 32 chars)");
  }
  if (!timingSafeEqual(sha256Hex(provided), sha256Hex(expected))) {
    throw new Error("Unauthorized: invalid server secret");
  }
}

/** Trusted calls from the MCP server, which already authenticated the Clerk user. */
export const serverQuery = customQuery(query, {
  args: { serverSecret: v.string(), clerkUserId: v.string() },
  input: async (ctx, { serverSecret, clerkUserId }) => {
    assertServerSecret(serverSecret);
    const user = await getUserByClerkId(ctx, clerkUserId);
    return { ctx: { user }, args: {} };
  },
});

export const serverMutation = customMutation(mutation, {
  args: { serverSecret: v.string(), clerkUserId: v.string() },
  input: async (ctx, { serverSecret, clerkUserId }) => {
    assertServerSecret(serverSecret);
    const user = await ensureUser(ctx, clerkUserId);
    return { ctx: { user }, args: {} };
  },
});

/** Server-only calls that are not tied to a user yet (e.g. API key resolution). */
export const serverOnlyMutation = customMutation(mutation, {
  args: { serverSecret: v.string() },
  input: async (_ctx, { serverSecret }) => {
    assertServerSecret(serverSecret);
    return { ctx: {}, args: {} };
  },
});

async function getDeviceByToken(
  ctx: QueryCtx,
  deviceToken: string,
): Promise<{ device: Doc<"devices">; user: Doc<"users"> }> {
  const device = await ctx.db
    .query("devices")
    .withIndex("by_token_hash", (q) => q.eq("tokenHash", sha256Hex(deviceToken)))
    .unique();
  if (!device || device.revokedAt !== undefined) {
    throw new Error("Device not paired or revoked");
  }
  const user = await ctx.db.get("users", device.userId);
  if (!user) throw new Error("Device owner not found");
  return { device, user };
}

/** Calls from a paired desktop/Android device, authenticated by its device token. */
export const deviceQuery = customQuery(query, {
  args: { deviceToken: v.string() },
  input: async (ctx, { deviceToken }) => {
    const { device, user } = await getDeviceByToken(ctx, deviceToken);
    return { ctx: { device, user }, args: {} };
  },
});

export const deviceMutation = customMutation(mutation, {
  args: { deviceToken: v.string() },
  input: async (ctx, { deviceToken }) => {
    const { device, user } = await getDeviceByToken(ctx, deviceToken);
    return { ctx: { device, user }, args: {} };
  },
});
