import { api } from "@alarm-mcp/backend/api";
import { ConvexHttpClient } from "convex/browser";
import { serverEnv } from "../env";
import type { AlarmBackend, McpUser } from "./backend";

let client: ConvexHttpClient | undefined;

export function convexClient(): ConvexHttpClient {
  client ??= new ConvexHttpClient(serverEnv.convexUrl());
  return client;
}

export function convexBackend(user: McpUser): AlarmBackend {
  const convex = convexClient();
  const auth = { serverSecret: serverEnv.mcpServerSecret(), clerkUserId: user.clerkUserId };
  return {
    listDevices: () => convex.query(api.mcp.listDevices, auth),
    createAlarm: (spec) => convex.mutation(api.mcp.createAlarmForAgent, { ...auth, ...spec }),
    getAlarm: (alarmId) => convex.query(api.mcp.getAlarm, { ...auth, alarmId }),
    listAlarms: (args) => convex.query(api.mcp.listAlarms, { ...auth, ...args }),
    cancelAlarm: (alarmId) => convex.mutation(api.mcp.cancelAlarmForAgent, { ...auth, alarmId }),
    rescheduleAlarm: (alarmId, trigger) =>
      convex.mutation(api.mcp.rescheduleAlarmForAgent, { ...auth, alarmId, trigger }),
  };
}

export async function resolveApiKey(apiKey: string): Promise<string | null> {
  const resolved = await convexClient().mutation(api.mcp.resolveApiKey, {
    serverSecret: serverEnv.mcpServerSecret(),
    apiKey,
  });
  return resolved?.clerkUserId ?? null;
}
