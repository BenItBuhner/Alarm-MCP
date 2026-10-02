// Framework-free constants and helpers shared by the web app, MCP server and desktop app.
export type {
  AlarmSpec,
  AlarmStatus,
  AlarmView,
  Capabilities,
  DeviceAlarm,
  DeviceView,
  Escalation,
  Intensity,
  Platform,
  Sound,
  Targets,
  Trigger,
} from "./validators";

export const LIMITS = {
  titleMax: 120,
  messageMax: 1000,
  objectiveMax: 2000,
  responseOptionsMax: 4,
  responseOptionMax: 40,
  maxRingSecondsMin: 10,
  maxRingSecondsMax: 3600,
  escalationAfterMin: 5,
  escalationAfterMax: 3600,
  scheduleHorizonMs: 30 * 24 * 60 * 60 * 1000,
  activeAlarmsPerUser: 100,
  pairingCodeTtlMs: 10 * 60 * 1000,
  snoozeMinutesMax: 120,
} as const;

export const DEFAULT_MAX_RING_SECONDS = {
  gentle: 120,
  normal: 300,
  urgent: 600,
} as const;

export const INTENSITY_DESCRIPTIONS = {
  gentle:
    "Soft: a notification with a quiet chime. Never fullscreen, no alarm-volume override. Good for 'wake me softly', FYIs and non-urgent permission prompts.",
  normal:
    "Standard alarm: alarm window / alarm activity with a ringtone at alarm volume until acknowledged.",
  urgent:
    "Loud: fullscreen over the lock screen, maximum alarm volume, vibration and repeating klaxon until acknowledged. For failures, deadlines and 'wake me no matter what'.",
} as const;

/** A device is considered online if it checked in within this window. */
export const ONLINE_WINDOW_MS = 2 * 60 * 1000;
export const HEARTBEAT_INTERVAL_MS = 45 * 1000;

export function isOnline(lastSeenAt: number, now: number): boolean {
  return now - lastSeenAt <= ONLINE_WINDOW_MS;
}

export function formatPairingCode(code: string): string {
  return code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}
