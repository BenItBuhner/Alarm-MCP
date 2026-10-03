import type {
  AlarmSpec,
  AlarmStatus,
  AlarmView,
  DeviceView,
  Trigger,
} from "@alarm-mcp/backend/shared";

/** Everything the MCP tools need, scoped to one authenticated user. */
export interface AlarmBackend {
  listDevices(): Promise<DeviceView[]>;
  createAlarm(spec: AlarmSpec & { client?: string }): Promise<AlarmView>;
  getAlarm(alarmId: string): Promise<AlarmView>;
  listAlarms(args: { status?: AlarmStatus; limit?: number }): Promise<AlarmView[]>;
  cancelAlarm(alarmId: string): Promise<AlarmView>;
  rescheduleAlarm(alarmId: string, trigger: Trigger): Promise<AlarmView>;
}

export type McpUser = {
  clerkUserId: string;
  /** OAuth client id or API key prefix, recorded as the alarm source. */
  client: string;
};
