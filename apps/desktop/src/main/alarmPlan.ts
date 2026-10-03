import type { DeviceAlarm } from "@alarm-mcp/backend/shared";

export type OpenAlarm = { alarm: DeviceAlarm; local: boolean };

export type RingingDiff = {
  open: DeviceAlarm[];
  update: DeviceAlarm[];
  close: string[];
};

/**
 * Compares alarms currently shown on this machine with the server's ringing set.
 * Locally fired backups are kept open until the server either takes them over
 * (they appear in `ringing`) or stops listing them as upcoming.
 */
export function diffRinging(
  shown: ReadonlyMap<string, OpenAlarm>,
  ringing: DeviceAlarm[],
  upcomingIds: ReadonlySet<string>,
): RingingDiff {
  const serverIds = new Set<string>(ringing.map((a) => a.alarmId));
  const open: DeviceAlarm[] = [];
  const update: DeviceAlarm[] = [];
  for (const alarm of ringing) {
    const current = shown.get(alarm.alarmId);
    if (!current) open.push(alarm);
    else if (
      current.local ||
      current.alarm.intensity !== alarm.intensity ||
      current.alarm.deliveryId !== alarm.deliveryId
    ) {
      update.push(alarm);
    }
  }
  const close = [...shown.entries()]
    .filter(([id, { local }]) => !serverIds.has(id) && !(local && upcomingIds.has(id)))
    .map(([id]) => id);
  return { open, update, close };
}

/** Local backups ring if the server has not delivered an alarm shortly after its fire time. */
export const BACKUP_GRACE_MS = 20_000;
export const BACKUP_HORIZON_MS = 24 * 60 * 60 * 1000;

export function backupsToArm(
  upcoming: DeviceAlarm[],
  now: number,
): { alarm: DeviceAlarm; delayMs: number }[] {
  return upcoming
    .map((alarm) => ({ alarm, delayMs: Math.max(alarm.fireAt + BACKUP_GRACE_MS - now, 0) }))
    .filter(({ delayMs }) => delayMs <= BACKUP_HORIZON_MS);
}

export type WindowMode = "corner" | "center" | "fullscreen";

export function windowModeFor(intensity: DeviceAlarm["intensity"]): WindowMode {
  switch (intensity) {
    case "gentle":
      return "corner";
    case "normal":
      return "center";
    case "urgent":
      return "fullscreen";
  }
}
