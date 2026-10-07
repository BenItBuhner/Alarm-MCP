import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { computeFireAt, normalizeSpec, resolveDeviceSelectors } from "./alarmLogic";
import { fail } from "./errors";
import { LIMITS, selectorsMeanAllDevices } from "./shared";
import type {
  AlarmSource,
  AlarmSpec,
  AlarmView,
  DeviceAlarm,
  Intensity,
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
  if (!alarm || alarm.userId !== userId) fail(`Alarm not found: ${rawAlarmId}`);
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

/** Deliver the alarm now. Safe to call from create/reschedule; no-op if not scheduled. */
export async function fireAlarm(ctx: MutationCtx, alarmId: Id<"alarms">): Promise<void> {
  const alarm = await ctx.db.get("alarms", alarmId);
  if (!alarm || alarm.status !== "scheduled") return;

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
    return;
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
}

export async function ringExtraDevices(
  ctx: MutationCtx,
  alarm: Doc<"alarms">,
  devices: Doc<"devices">[],
  intensity: Intensity,
): Promise<Id<"devices">[]> {
  await ring(ctx, alarm, devices, intensity);
  return devices.map((d) => d._id);
}

export async function pushAlarmTo(ctx: MutationCtx, alarmId: Id<"alarms">, deviceIds: Id<"devices">[]) {
  await pushTo(ctx, alarmId, deviceIds);
}

async function armFire(ctx: MutationCtx, alarmId: Id<"alarms">, fireAt: number): Promise<void> {
  if (fireAt <= Date.now()) {
    await fireAlarm(ctx, alarmId);
    return;
  }
  const fireJobId = await ctx.scheduler.runAt(fireAt, internal.alarms.fire, { alarmId });
  await ctx.db.patch("alarms", alarmId, { fireJobId });
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
    fail(
      "No devices are signed in. Open Alarm MCP on this computer, phone, or browser, sign in with email, and it will register itself.",
    );
  }

  let targetMode: "all" | "devices" = spec.targets.kind;
  let targetDeviceIds: Id<"devices">[] = [];
  if (spec.targets.kind === "devices") {
    if (selectorsMeanAllDevices(spec.targets.selectors)) {
      targetMode = "all";
    } else {
      const { deviceIds, unmatched } = resolveDeviceSelectors(devices, spec.targets.selectors);
      const available = devices.map((d) => `"${d.name}" (${d.platform})`).join(", ");
      if (unmatched.length > 0) {
        fail(
          `Could not match device(s) ${unmatched.map((u) => `"${u}"`).join(", ")}. Available devices: ${available}`,
        );
      }
      if (deviceIds.length === 0) {
        fail(`No devices selected. Available devices: ${available}`);
      }
      targetDeviceIds = deviceIds;
    }
  }

  if ((await countActiveAlarms(ctx, user._id)) >= LIMITS.activeAlarmsPerUser) {
    fail(`Too many active alarms (limit ${LIMITS.activeAlarmsPerUser}). Cancel some before creating more.`);
  }

  const alarmId = await ctx.db.insert("alarms", {
    userId: user._id,
    ...normalized,
    currentIntensity: normalized.intensity,
    source,
    fireAt,
    targetMode,
    targetDeviceIds,
    status: "scheduled",
    snoozeCount: 0,
    createdAt: now,
  });
  await armFire(ctx, alarmId, fireAt);
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
    fail(`Alarm is already ${alarm.status}`);
  }
  if (response.action === "respond") {
    if (!response.option || !alarm.responseOptions.includes(response.option)) {
      fail("Response option is not one of the alarm's responseOptions");
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
    fail(`Alarm is already ${alarm.status}`);
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
    fail(`Alarm is already ${alarm.status}; create a new alarm instead`);
  }
  const fireAt = computeFireAt(trigger, Date.now());
  await cancelJob(ctx, alarm.fireJobId);
  await cancelJob(ctx, alarm.escalateJobId);
  await cancelJob(ctx, alarm.expireJobId);
  await closeDeliveries(ctx, alarm._id, "silenced");
  await ctx.db.patch("alarms", alarm._id, {
    status: "scheduled",
    fireAt,
    firedAt: undefined,
    currentIntensity: alarm.intensity,
    fireJobId: undefined,
    escalateJobId: undefined,
    expireJobId: undefined,
    ...(snoozedBy
      ? {
          snoozeCount: alarm.snoozeCount + 1,
          response: { action: "snooze" as const, deviceId: snoozedBy, at: Date.now() },
        }
      : {}),
  });
  await armFire(ctx, alarm._id, fireAt);
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
