import type { AlarmMcpBridge } from "../shared/bridge";

declare global {
  interface Window {
    alarmMcp: AlarmMcpBridge;
  }
}

export {};
