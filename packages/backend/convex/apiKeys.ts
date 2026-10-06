import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action, internalMutation } from "./_generated/server";
import { API_KEY_PREFIX, generateSecret, sha256Hex } from "./lib/crypto";
import { fail } from "./lib/errors";
import { ensureUser, userMutation, userQuery } from "./lib/functions";

const apiKeyView = v.object({
  id: v.id("apiKeys"),
  name: v.string(),
  prefix: v.string(),
  createdAt: v.number(),
  lastUsedAt: v.optional(v.number()),
});

export const list = userQuery({
  args: {},
  returns: v.array(apiKeyView),
  handler: async (ctx) => {
    if (!ctx.user) return [];
    const keys = await ctx.db
      .query("apiKeys")
      .withIndex("by_user", (q) => q.eq("userId", ctx.user!._id))
      .take(50);
    return keys
      .filter((k) => k.revokedAt === undefined)
      .map((k) => ({
        id: k._id,
        name: k.name,
        prefix: k.prefix,
        createdAt: k.createdAt,
        lastUsedAt: k.lastUsedAt,
      }));
  },
});

export const insert = internalMutation({
  args: { clerkId: v.string(), name: v.string(), prefix: v.string(), keyHash: v.string() },
  returns: v.id("apiKeys"),
  handler: async (ctx, { clerkId, name, prefix, keyHash }) => {
    const user = await ensureUser(ctx, clerkId);
    const active = (
      await ctx.db
        .query("apiKeys")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .take(50)
    ).filter((k) => k.revokedAt === undefined);
    if (active.length >= 20) fail("API key limit reached (20). Revoke unused keys.");
    return await ctx.db.insert("apiKeys", {
      userId: user._id,
      name: name.trim().slice(0, 60) || "API key",
      prefix,
      keyHash,
      createdAt: Date.now(),
    });
  },
});

/** Personal API key for MCP clients that cannot do OAuth. Returned once, stored hashed. */
export const create = action({
  args: { name: v.string() },
  returns: v.object({ id: v.id("apiKeys"), key: v.string() }),
  handler: async (ctx, { name }): Promise<{ id: Id<"apiKeys">; key: string }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) fail("Not authenticated");
    const key = generateSecret(API_KEY_PREFIX);
    const id: Id<"apiKeys"> = await ctx.runMutation(internal.apiKeys.insert, {
      clerkId: identity.subject,
      name,
      prefix: key.slice(0, 10),
      keyHash: sha256Hex(key),
    });
    return { id, key };
  },
});

export const revoke = userMutation({
  args: { apiKeyId: v.id("apiKeys") },
  returns: v.null(),
  handler: async (ctx, { apiKeyId }) => {
    const key = await ctx.db.get("apiKeys", apiKeyId);
    if (!key || key.userId !== ctx.user._id) fail("API key not found");
    await ctx.db.patch("apiKeys", apiKeyId, { revokedAt: Date.now() });
    return null;
  },
});
