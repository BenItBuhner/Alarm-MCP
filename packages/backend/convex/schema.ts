import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  alarmResponse,
  alarmSource,
  alarmStatus,
  capabilities,
  deliveryStatus,
  escalation,
  intensity,
  platform,
  sound,
  targetMode,
} from "./lib/validators";

export default defineSchema({
  users: defineTable({
    clerkId: v.string(),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_clerk_id", ["clerkId"]),

  devices: defineTable({
    userId: v.id("users"),
    name: v.string(),
    platform,
    tokenHash: v.string(),
    capabilities,
    pushToken: v.optional(v.string()),
    appVersion: v.optional(v.string()),
    createdAt: v.number(),
    lastSeenAt: v.number(),
    revokedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_token_hash", ["tokenHash"]),

  pairingCodes: defineTable({
    userId: v.id("users"),
    code: v.string(),
    expiresAt: v.number(),
    usedAt: v.optional(v.number()),
    deviceId: v.optional(v.id("devices")),
  })
    .index("by_code", ["code"])
    .index("by_user", ["userId"]),

  apiKeys: defineTable({
    userId: v.id("users"),
    name: v.string(),
    prefix: v.string(),
    keyHash: v.string(),
    createdAt: v.number(),
    lastUsedAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
  })
    .index("by_key_hash", ["keyHash"])
    .index("by_user", ["userId"]),

  alarms: defineTable({
    userId: v.id("users"),
    title: v.string(),
    message: v.optional(v.string()),
    objective: v.optional(v.string()),
    source: alarmSource,
    fireAt: v.number(),
    targetMode,
    targetDeviceIds: v.array(v.id("devices")),
    intensity,
    currentIntensity: intensity,
    speak: v.boolean(),
    vibrate: v.boolean(),
    sound,
    escalation: v.optional(escalation),
    maxRingSeconds: v.number(),
    responseOptions: v.array(v.string()),
    status: alarmStatus,
    snoozeCount: v.number(),
    createdAt: v.number(),
    firedAt: v.optional(v.number()),
    resolvedAt: v.optional(v.number()),
    response: v.optional(alarmResponse),
    fireJobId: v.optional(v.id("_scheduled_functions")),
    escalateJobId: v.optional(v.id("_scheduled_functions")),
    expireJobId: v.optional(v.id("_scheduled_functions")),
  })
    .index("by_user_and_status", ["userId", "status"])
    .index("by_user_and_created", ["userId", "createdAt"]),

  deliveries: defineTable({
    alarmId: v.id("alarms"),
    userId: v.id("users"),
    deviceId: v.id("devices"),
    status: deliveryStatus,
    intensity,
    createdAt: v.number(),
    pushedAt: v.optional(v.number()),
    seenAt: v.optional(v.number()),
    resolvedAt: v.optional(v.number()),
  })
    .index("by_alarm", ["alarmId"])
    .index("by_device_and_status", ["deviceId", "status"]),
});
