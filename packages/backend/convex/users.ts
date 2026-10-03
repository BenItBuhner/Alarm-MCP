import { v } from "convex/values";
import { userMutation, userQuery } from "./lib/functions";

/** Called by the dashboard after sign-in to create/refresh the user row. */
export const ensure = userMutation({
  args: {},
  returns: v.id("users"),
  handler: async (ctx) => ctx.user._id,
});

export const me = userQuery({
  args: {},
  returns: v.union(
    v.null(),
    v.object({ id: v.id("users"), name: v.optional(v.string()), email: v.optional(v.string()) }),
  ),
  handler: async (ctx) =>
    ctx.user ? { id: ctx.user._id, name: ctx.user.name, email: ctx.user.email } : null,
});
