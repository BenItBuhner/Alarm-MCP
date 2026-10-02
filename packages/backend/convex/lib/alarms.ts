import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { computeFireAt, normalizeSpec, resolveDeviceSelectors } from "./alarmLogic";
import { LIMITS } from "./shared";
import type {
  AlarmSource,
  AlarmSpec,
  AlarmView,
  DeviceAlarm,
  Trigger,
} from "./validators";

export async function activeDevices(
  ctx: QueryCtx,
  userId: Id<"users">,
): Promise<Doc<"devices">[]> {
  const devices = await ctx.db
    .query("devices")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .take(100);
  return devices.filter((d) => d.revokedAt === undefined);
}

export async function getOwnedAlarm(
  ctx: QueryCtx,
  userId: Id<"users">,
  rawAlarmId: string,
): Promise<Doc<"alarms">> {
  const alarmId = ctx.db.normalizeId("alarms", rawAlarmId);
  const alarm = alarmId ? await ctx.db.get("alarms", alarmId) : null;
  if (!alarm || alarm.userId !== userId) throw new Error(`Alarm not found: ${rawAlarmId}`);
  return alarm;
}

async function countActiveAlarms(ctx: QueryCtx, userId: Id<"users">): Promise<number> {
  const limit = LIMITS.activeAlarmsPerUser;
  const scheduled = await ctx.db
    .query("alarms")
    .withIndex("by_user_and_status", (q) => q.eq("userId", userId).eq("status", "scheduled"))
    .take(limit);
  const ringing = await ctx.db
    .query("alarms")
    .withIndex("by_user_and_status", (q) => q.eq("userId", userId).eq("status", "ringing"))
    .take(limit);
  return scheduled.length + ringing.length;
}

async function scheduleFire(
  ctx: MutationCtx,
  alarmId: Id<"alarms">,
  fireAt: number,
): Promise<Id<"_scheduled_functions">> {
  return fireAt <= Date.now()
    ? await ctx.scheduler.runAfter(0, internal.alarms.fire, { alarmId })
    : await ctx.scheduler.runAt(fireAt, internal.alarms.fire, { alarmId });
}

export async function createAlarm(
  ctx: MutationCtx,
  user: Doc<"users">,
  spec: AlarmSpec,
  source: AlarmSource,
): Promise<Id<"alarms">> {
  const normalized = normalizeSpec(spec);
  const now = Date.now();
  const fireAt = computeFireAt(spec.trigger, now);

  const devices = await activeDevices(ctx, user._id);
  if (devices.length === 0) {
    throw new Error(
      "No devices are paired. Install the Alarm MCP desktop or Android app and pair it from the dashboard first.",
    );
  }

  let targetDeviceIds: Id<"devices">[] = [];
  if (spec.targets.kind === "devices") {
    const { deviceIds, unmatched } = resolveDeviceSelectors(devices, spec.targets.selectors);
    const available = devices.map((d) => `"${d.name}" (${d.platform})`).join(", ");
    if (unmatched.length > 0) {
      throw new Error(
        `Could not match device(s) ${unmatched.map((u) => `"${u}"`).join(", ")}. Available devices: ${available}`,
      );
    }
    if (deviceIds.length === 0) {
      throw new Error(`No devices selected. Available devices: ${available}`);
    }
    targetDeviceIds = deviceIds;
  }

  if ((await countActiveAlarms(ctx, user._id)) >= LIMITS.activeAlarmsPerUser) {
    throw new Error(
      `Too many active alarms (limit ${LIMITS.activeAlarmsPerUser}). Cancel some before creating more.`,
    );
  }

  const alarmId = await ctx.db.insert("alarms", {
    userId: user._id,
    ...normalized,
    currentIntensity: normalized.intensity,
    source,
    fireAt,
    targetMode: spec.targets.kind,
    targetDeviceIds,
    status: "scheduled",
    snoozeCount: 0,
    createdAt: now,
  });
  const fireJobId = await scheduleFire(ctx, alarmId, fireAt);
  await ctx.db.patch("alarms", alarmId, { fireJobId });
  return alarmId;
}

export function alarmTargetsDevice(alarm: Doc<"alarms">, deviceId: Id<"devices">): boolean {
  return alarm.targetMode === "all" || alarm.targetDeviceIds.includes(deviceId);
}

async function cancelJob(ctx: MutationCtx, jobId: Id<"_scheduled_functions"> | undefined) {
  if (!jobId) return;
  const job = await ctx.db.system.get("_scheduled_functions", jobId);
  if (job && job.state.kind === "pending") await ctx.scheduler.cancel(jobId);
}

async function closeDeliveries(
  ctx: MutationCtx,
  alarmId: Id<"alarms">,
  status: "silenced" | "expired",
  acknowledgedBy?: Id<"devices">,
): Promise<void> {
  const now = Date.now();
  const deliveries = await ctx.db
    .query("deliveries")
    .withIndex("by_alarm", (q) => q.eq("alarmId", alarmId))
    .take(200);
  for (const delivery of deliveries) {
    if (delivery.status !== "ringing") continue;
    await ctx.db.patch("deliveries", delivery._id, {
      status: delivery.deviceId === acknowledgedBy ? "acknowledged" : status,
      resolvedAt: now,
    });
  }
}

export async function acknowledgeAlarm(
  ctx: MutationCtx,
  alarm: Doc<"alarms">,
  response: { action: "dismiss" | "respond"; option?: string; deviceId: Id<"devices"> },
): Promise<void> {
  if (alarm.status !== "ringing" && alarm.status !== "scheduled") {
    throw new Error(`Alarm is already ${alarm.status}`);
  }
  if (response.action === "respond") {
    if (!response.option || !alarm.responseOptions.includes(response.option)) {
      throw new Error("Response option is not one of the alarm's responseOptions");
    }
  }
  const now = Date.now();
  await cancelJob(ctx, alarm.fireJobId);
  await cancelJob(ctx, alarm.escalateJobId);
  await cancelJob(ctx, alarm.expireJobId);
  await closeDeliveries(ctx, alarm._id, "silenced", response.deviceId);
  await ctx.db.patch("alarms", alarm._id, {
    status: "acknowledged",
    resolvedAt: now,
    response: { ...response, at: now },
    fireJobId: undefined,
    escalateJobId: undefined,
    expireJobId: undefined,
  });
}

export async function cancelAlarm(ctx: MutationCtx, alarm: Doc<"alarms">): Promise<void> {
  if (alarm.status !== "scheduled" && alarm.status !== "ringing") {
    throw new Error(`Alarm is already ${alarm.status}`);
  }
  await cancelJob(ctx, alarm.fireJobId);
  await cancelJob(ctx, alarm.escalateJobId);
  await cancelJob(ctx, alarm.expireJobId);
  await closeDeliveries(ctx, alarm._id, "silenced");
  await ctx.db.patch("alarms", alarm._id, {
    status: "cancelled",
    resolvedAt: Date.now(),
    fireJobId: undefined,
    escalateJobId: undefined,
    expireJobId: undefined,
  });
}

export async function rescheduleAlarm(
  ctx: MutationCtx,
  alarm: Doc<"alarms">,
  trigger: Trigger,
  snoozedBy?: Id<"devices">,
): Promise<number> {
  if (alarm.status !== "scheduled" && alarm.status !== "ringing") {
    throw new Error(`Alarm is already ${alarm.status}; create a new alarm instead`);
  }
  const fireAt = computeFireAt(trigger, Date.now());
  await cancelJob(ctx, alarm.fireJobId);
  await cancelJob(ctx, alarm.escalateJobId);
  await cancelJob(ctx, alarm.expireJobId);
  await closeDeliveries(ctx, alarm._id, "silenced", snoozedBy);
  const fireJobId = await scheduleFire(ctx, alarm._id, fireAt);
  await ctx.db.patch("alarms", alarm._id, {
    status: "scheduled",
    fireAt,
    firedAt: undefined,
    currentIntensity: alarm.intensity,
    fireJobId,
    escalateJobId: undefined,
    expireJobId: undefined,
    ...(snoozedBy
      ? {
          snoozeCount: alarm.snoozeCount + 1,
          response: { action: "snooze" as const, deviceId: snoozedBy, at: Date.now() },
        }
      : {}),
  });
  return fireAt;
}

export async function toAlarmView(ctx: QueryCtx, alarm: Doc<"alarms">): Promise<AlarmView> {
  const deviceNames = new Map<Id<"devices">, string>();
  const nameOf = async (deviceId: Id<"devices">): Promise<string> => {
    const cached = deviceNames.get(deviceId);
    if (cached) return cached;
    const device = await ctx.db.get("devices", deviceId);
    const name = device?.name ?? "Removed device";
    deviceNames.set(deviceId, name);
    return name;
  };

  const deliveries = await ctx.db
    .query("deliveries")
    .withIndex("by_alarm", (q) => q.eq("alarmId", alarm._id))
    .take(50);

  return {
    id: alarm._id,
    title: alarm.title,
    message: alarm.message,
    objective: alarm.objective,
    source: alarm.source,
    status: alarm.status,
    intensity: alarm.intensity,
    currentIntensity: alarm.currentIntensity,
    speak: alarm.speak,
    vibrate: alarm.vibrate,
    sound: alarm.sound,
    escalation: alarm.escalation,
    maxRingSeconds: alarm.maxRingSeconds,
    responseOptions: alarm.responseOptions,
    fireAt: alarm.fireAt,
    createdAt: alarm.createdAt,
    firedAt: alarm.firedAt,
    resolvedAt: alarm.resolvedAt,
    snoozeCount: alarm.snoozeCount,
    targetMode: alarm.targetMode,
    targetDeviceNames: await Promise.all(alarm.targetDeviceIds.map(nameOf)),
    response: alarm.response
      ? {
          action: alarm.response.action,
          option: alarm.response.option,
          deviceName: await nameOf(alarm.response.deviceId),
          at: alarm.response.at,
        }
      : undefined,
    deliveries: await Promise.all(
      deliveries.map(async (d) => ({
        deviceId: d.deviceId,
        deviceName: await nameOf(d.deviceId),
        status: d.status,
        intensity: d.intensity,
        seenAt: d.seenAt,
        resolvedAt: d.resolvedAt,
      })),
    ),
  };
}

export function toDeviceAlarm(
  alarm: Doc<"alarms">,
  delivery?: Doc<"deliveries">,
): DeviceAlarm {
  return {
    alarmId: alarm._id,
    deliveryId: delivery?._id,
    title: alarm.title,
    message: alarm.message,
    intensity: delivery?.intensity ?? alarm.currentIntensity,
    speak: alarm.speak,
    vibrate: alarm.vibrate,
    sound: alarm.sound,
    responseOptions: alarm.responseOptions,
    fireAt: alarm.fireAt,
    firedAt: alarm.firedAt,
    maxRingSeconds: alarm.maxRingSeconds,
  };
}

export async function recentAlarms(
  ctx: QueryCtx,
  userId: Id<"users">,
  limit: number,
): Promise<Doc<"alarms">[]> {
  return await ctx.db
    .query("alarms")
    .withIndex("by_user_and_created", (q) => q.eq("userId", userId))
    .order("desc")
    .take(limit);
}
