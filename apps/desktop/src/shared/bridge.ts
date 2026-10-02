import type { DeviceAlarm } from "@alarm-mcp/backend/shared";

export type ConnectionStatus = "unpaired" | "connecting" | "connected" | "offline";

export type AppState = {
  status: ConnectionStatus;
  version: string;
  convexUrl: string;
  deviceName?: string;
  userName?: string;
  ringingCount: number;
  upcoming: { title: string; fireAt: number }[];
  launchAtLogin: boolean;
  lastError?: string;
};

export type PairInput = { convexUrl: string; code: string; name: string };

export type RespondInput = {
  alarmId: string;
  action: "dismiss" | "respond" | "snooze";
  option?: string;
  snoozeMinutes?: number;
};

/** API exposed to renderer windows by the preload script as `window.alarmMcp`. */
export interface AlarmMcpBridge {
  getState(): Promise<AppState>;
  onState(callback: (state: AppState) => void): void;
  pair(input: PairInput): Promise<{ ok: true } | { ok: false; error: string }>;
  unpair(): Promise<void>;
  setLaunchAtLogin(enabled: boolean): Promise<void>;
  testAlarm(intensity: DeviceAlarm["intensity"]): Promise<void>;
  getAlarm(): Promise<DeviceAlarm | null>;
  onAlarmUpdate(callback: (alarm: DeviceAlarm) => void): void;
  respond(input: RespondInput): Promise<void>;
}

export const IPC = {
  getState: "state:get",
  stateChanged: "state:changed",
  pair: "device:pair",
  unpair: "device:unpair",
  setLaunchAtLogin: "app:launch-at-login",
  testAlarm: "alarm:test",
  getAlarm: "alarm:get",
  alarmUpdated: "alarm:updated",
  respond: "alarm:respond",
} as const;
