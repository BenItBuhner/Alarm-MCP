import { v, type Infer } from "convex/values";

export const intensity = v.union(
  v.literal("gentle"),
  v.literal("normal"),
  v.literal("urgent"),
);
export type Intensity = Infer<typeof intensity>;

export const platform = v.union(v.literal("desktop"), v.literal("android"));
export type Platform = Infer<typeof platform>;

export const sound = v.union(
  v.literal("chime"),
  v.literal("beacon"),
  v.literal("klaxon"),
);
export type Sound = Infer<typeof sound>;

export const capabilities = v.object({
  sound: v.boolean(),
  vibrate: v.boolean(),
  fullScreen: v.boolean(),
  speak: v.boolean(),
  actions: v.boolean(),
});
export type Capabilities = Infer<typeof capabilities>;

export const trigger = v.union(
  v.object({ kind: v.literal("now") }),
  v.object({ kind: v.literal("at"), at: v.number() }),
  v.object({ kind: v.literal("in"), seconds: v.number() }),
);
export type Trigger = Infer<typeof trigger>;

export const targets = v.union(
  v.object({ kind: v.literal("all") }),
  v.object({ kind: v.literal("devices"), selectors: v.array(v.string()) }),
);
export type Targets = Infer<typeof targets>;

export const targetMode = v.union(v.literal("all"), v.literal("devices"));

export const escalation = v.object({
  afterSeconds: v.number(),
  toIntensity: intensity,
  expandToAllDevices: v.boolean(),
});
export type Escalation = Infer<typeof escalation>;

export const alarmStatus = v.union(
  v.literal("scheduled"),
  v.literal("ringing"),
  v.literal("acknowledged"),
  v.literal("missed"),
  v.literal("cancelled"),
);
export type AlarmStatus = Infer<typeof alarmStatus>;

export const deliveryStatus = v.union(
  v.literal("ringing"),
  v.literal("acknowledged"),
  v.literal("silenced"),
  v.literal("expired"),
);

export const alarmSource = v.object({
  kind: v.union(v.literal("mcp"), v.literal("web"), v.literal("device")),
  client: v.optional(v.string()),
});
export type AlarmSource = Infer<typeof alarmSource>;

export const responseAction = v.union(
  v.literal("dismiss"),
  v.literal("respond"),
  v.literal("snooze"),
);

export const alarmResponse = v.object({
  action: responseAction,
  option: v.optional(v.string()),
  deviceId: v.id("devices"),
  at: v.number(),
});

/** Arguments accepted when creating an alarm from any surface. */
export const alarmSpecFields = {
  title: v.string(),
  message: v.optional(v.string()),
  objective: v.optional(v.string()),
  trigger,
  targets,
  intensity,
  speak: v.optional(v.boolean()),
  vibrate: v.optional(v.boolean()),
  sound: v.optional(sound),
  escalation: v.optional(escalation),
  maxRingSeconds: v.optional(v.number()),
  responseOptions: v.optional(v.array(v.string())),
};
export const alarmSpec = v.object(alarmSpecFields);
export type AlarmSpec = Infer<typeof alarmSpec>;

export const deviceView = v.object({
  id: v.id("devices"),
  name: v.string(),
  platform,
  capabilities,
  appVersion: v.optional(v.string()),
  createdAt: v.number(),
  lastSeenAt: v.number(),
  pushEnabled: v.boolean(),
});

export const deliveryView = v.object({
  deviceId: v.id("devices"),
  deviceName: v.string(),
  status: deliveryStatus,
  intensity,
  seenAt: v.optional(v.number()),
  resolvedAt: v.optional(v.number()),
});

export const alarmView = v.object({
  id: v.id("alarms"),
  title: v.string(),
  message: v.optional(v.string()),
  objective: v.optional(v.string()),
  source: alarmSource,
  status: alarmStatus,
  intensity,
  currentIntensity: intensity,
  speak: v.boolean(),
  vibrate: v.boolean(),
  sound,
  escalation: v.optional(escalation),
  maxRingSeconds: v.number(),
  responseOptions: v.array(v.string()),
  fireAt: v.number(),
  createdAt: v.number(),
  firedAt: v.optional(v.number()),
  resolvedAt: v.optional(v.number()),
  snoozeCount: v.number(),
  targetMode,
  targetDeviceNames: v.array(v.string()),
  response: v.optional(
    v.object({
      action: responseAction,
      option: v.optional(v.string()),
      deviceName: v.string(),
      at: v.number(),
    }),
  ),
  deliveries: v.array(deliveryView),
});
export type AlarmView = Infer<typeof alarmView>;

/** What a device needs to render/ring an alarm locally. */
export const deviceAlarm = v.object({
  alarmId: v.id("alarms"),
  deliveryId: v.optional(v.id("deliveries")),
  title: v.string(),
  message: v.optional(v.string()),
  intensity,
  speak: v.boolean(),
  vibrate: v.boolean(),
  sound,
  responseOptions: v.array(v.string()),
  fireAt: v.number(),
  firedAt: v.optional(v.number()),
  maxRingSeconds: v.number(),
});
export type DeviceAlarm = Infer<typeof deviceAlarm>;
