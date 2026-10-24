import type { DeviceAlarm, Intensity } from "@alarm-mcp/backend/shared";

export type ConnectionStatus = "signed_out" | "needs_setup" | "connecting" | "connected" | "offline";

export type AppState = {
  status: ConnectionStatus;
  version: string;
  convexUrl: string;
  deviceName?: string;
  userName?: string;
  defaultIntensity: Intensity;
  ringingCount: number;
  upcoming: { title: string; fireAt: number }[];
  launchAtLogin: boolean;
  lastError?: string;
};

export type RegisterInput = { name: string; defaultIntensity: Intensity };

export type RespondInput = {
  alarmId: string;
  action: "dismiss" | "respond" | "snooze";
  option?: string;
  snoozeMinutes?: number;
};

export type OkResult = { ok: true } | { ok: false; error: string };

/** API exposed to renderer windows by the preload script as `window.alarmMcp`. */
export interface AlarmMcpBridge {
  getState(): Promise<AppState>;
  onState(callback: (state: AppState) => void): void;
  clerkSignIn(): Promise<OkResult>;
  registerDevice(input: RegisterInput): Promise<OkResult>;
  signOut(): Promise<void>;
  setLaunchAtLogin(enabled: boolean): Promise<void>;
  getAlarm(): Promise<DeviceAlarm | null>;
  onAlarmUpdate(callback: (alarm: DeviceAlarm) => void): void;
  respond(input: RespondInput): Promise<void>;
}

export const IPC = {
  getState: "state:get",
  stateChanged: "state:changed",
  clerkSignIn: "clerk:sign-in",
  registerDevice: "device:register",
  signOut: "device:sign-out",
  setLaunchAtLogin: "app:launch-at-login",
  getAlarm: "alarm:get",
  alarmUpdated: "alarm:updated",
  respond: "alarm:respond",
} as const;
