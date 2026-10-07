import type { AuthInfo, McpServer } from "@modelcontextprotocol/server";
import {
  INTENSITY_DESCRIPTIONS,
  LIMITS,
  selectorsMeanAllDevices,
  type AlarmView,
  type Trigger,
} from "@alarm-mcp/backend/shared";
import { z } from "zod";
import type { AlarmBackend, McpUser } from "./backend";
import { formatAlarm, formatDevices } from "./format";

export type BackendResolver = (authInfo: AuthInfo | undefined) => {
  backend: AlarmBackend;
  user: McpUser;
};

export const SERVER_INSTRUCTIONS = `Alarm MCP rings the user's real devices (Android phone, desktop computer, or this browser) so an agent can wake or alert them.

How to turn a natural-language request into alarms:
- Call list_devices first when the user names a device ("my phone", "laptop", "this browser") or you are unsure what is signed in.
- "Wake me when you're done" → when your task finishes, call create_alarm with no fire_at/in_seconds (rings now). Put the outcome in the message.
- "Softly"/"gently"/"if it's not urgent" → intensity "gentle". "No matter what"/failures/deadlines → "urgent". Otherwise "normal".
- "If you get blocked / need permission" → create_alarm with response_options like ["Approve","Deny"], then call get_alarm with wait_seconds to block until the user answers, and act on response.option.
- "Start soft, get louder if I don't wake up" → escalate_after_seconds + escalate_to (+ escalate_to_all_devices).
- "Wake me at 7 unless you finish first" (dead man's switch) → schedule with fire_at, then cancel_alarm when done, or reschedule_alarm to push it back while still working.
- Always pass the user's original request as objective, and use explicit UTC offsets in fire_at.
- An alarm is "acknowledged" once the user dismissed it or picked a response on any device; "missed" means nobody answered within max_ring_seconds.`;

const intensity = z
  .enum(["gentle", "normal", "urgent"])
  .describe(
    `How hard to wake the user. gentle: ${INTENSITY_DESCRIPTIONS.gentle} normal: ${INTENSITY_DESCRIPTIONS.normal} urgent: ${INTENSITY_DESCRIPTIONS.urgent}`,
  );

const whenFields = {
  fire_at: z
    .string()
    .optional()
    .describe(
      "When to ring, as ISO-8601 with an explicit UTC offset, e.g. 2026-10-02T07:00:00-07:00. Omit both fire_at and in_seconds to ring immediately.",
    ),
  in_seconds: z
    .number()
    .min(0)
    .max(LIMITS.scheduleHorizonMs / 1000)
    .optional()
    .describe("Ring after this many seconds. Alternative to fire_at."),
};

export function parseWhen(input: { fire_at?: string; in_seconds?: number }): Trigger {
  if (input.fire_at !== undefined && input.in_seconds !== undefined) {
    throw new Error("Pass either fire_at or in_seconds, not both");
  }
  if (input.in_seconds !== undefined) return { kind: "in", seconds: input.in_seconds };
  if (input.fire_at !== undefined) {
    if (!/(Z|[+-]\d{2}:?\d{2})$/i.test(input.fire_at.trim())) {
      throw new Error(
        "fire_at must include a UTC offset (e.g. 2026-10-02T07:00:00-07:00 or ...Z). Ask the user for their timezone if unknown.",
      );
    }
    const at = Date.parse(input.fire_at);
    if (Number.isNaN(at)) throw new Error(`fire_at is not a valid ISO-8601 timestamp: ${input.fire_at}`);
    return { kind: "at", at };
  }
  return { kind: "now" };
}

function result(text: string, structured: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text }],
    structuredContent: structured,
  };
}

function publicErrorMessage(error: unknown): string {
  if (error && typeof error === "object" && "data" in error) {
    const data = (error as { data: unknown }).data;
    if (typeof data === "string" && data.trim()) return data.trim();
  }
  const message = error instanceof Error ? error.message : String(error);
  const uncaught = message.match(/Uncaught (?:Convex)?Error:\s*([\s\S]+?)(?:\s+at\s|$)/);
  if (uncaught?.[1]) return uncaught[1].trim();
  // Convex production redacts non-ConvexError throws.
  if (/^\[Request ID: [^\]]+\] Server Error$/.test(message)) {
    return "Something went wrong on the alarm server. Retry; if it keeps failing, check Convex logs for the request id in the original error.";
  }
  return message.replace(/^.*?Uncaught Error:\s*/s, "").replace(/\s+at .*$/s, "");
}

function errorResult(error: unknown) {
  return { content: [{ type: "text" as const, text: `Error: ${publicErrorMessage(error)}` }], isError: true };
}

const TERMINAL = new Set<AlarmView["status"]>(["acknowledged", "missed", "cancelled"]);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function registerAlarmTools(
  server: McpServer,
  resolve: BackendResolver,
  options: { pollIntervalMs?: number; now?: () => number } = {},
): void {
  const pollIntervalMs = options.pollIntervalMs ?? 2000;
  const now = options.now ?? Date.now;

  server.registerTool(
    "list_devices",
    {
      title: "List devices",
      description:
        "List the user's signed-in devices (name, platform, online state, capabilities, default intensity). Use this to map phrases like 'my phone', 'work laptop', or 'this browser' to targets.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    async (_args, ctx) => {
      try {
        const devices = await resolve(ctx.http?.authInfo).backend.listDevices();
        return result(formatDevices(devices, now()), { devices });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "create_alarm",
    {
      title: "Create alarm",
      description:
        "Ring the user's devices now or at a scheduled time. Supports intensity (gentle/normal/urgent), per-device targeting by natural name, text-to-speech, escalation, and response buttons whose answer you can read back with get_alarm.",
      inputSchema: z.object({
        title: z.string().min(1).max(LIMITS.titleMax).describe("Short headline shown on the alarm, e.g. 'Build finished ✅'"),
        message: z.string().max(LIMITS.messageMax).optional().describe("Details: what happened and what you need from the user."),
        objective: z
          .string()
          .max(LIMITS.objectiveMax)
          .optional()
          .describe("The user's original natural-language request for this alarm, verbatim."),
        ...whenFields,
        devices: z
          .array(z.string())
          .optional()
          .describe(
            "Which devices to ring: device ids or natural names/platforms ('phone', 'android', 'desktop', 'work laptop', 'all'). Omit to ring every device.",
          ),
        intensity: intensity.default("normal"),
        speak: z.boolean().optional().describe("Read the title and message aloud with text-to-speech."),
        vibrate: z.boolean().optional().describe("Vibrate (phones). Defaults to true unless intensity is gentle."),
        sound: z.enum(["chime", "beacon", "klaxon"]).optional().describe("Sound preset. Defaults by intensity."),
        escalate_after_seconds: z
          .number()
          .min(LIMITS.escalationAfterMin)
          .max(LIMITS.escalationAfterMax)
          .optional()
          .describe("If not acknowledged after this many seconds, escalate."),
        escalate_to: intensity.optional().describe("Intensity to escalate to (default urgent)."),
        escalate_to_all_devices: z
          .boolean()
          .optional()
          .describe("When escalating, also ring every other signed-in device."),
        max_ring_seconds: z
          .number()
          .min(LIMITS.maxRingSecondsMin)
          .max(LIMITS.maxRingSecondsMax)
          .optional()
          .describe("Stop ringing and mark the alarm missed after this long. Defaults: gentle 120, normal 300, urgent 600."),
        response_options: z
          .array(z.string().min(1).max(LIMITS.responseOptionMax))
          .max(LIMITS.responseOptionsMax)
          .optional()
          .describe("Buttons the user can tap, e.g. ['Approve','Deny']. Read the choice with get_alarm."),
      }),
    },
    async (args, ctx) => {
      try {
        const { backend, user } = resolve(ctx.http?.authInfo);
        const trigger = parseWhen(args);
        const alarm = await backend.createAlarm({
          title: args.title,
          message: args.message,
          objective: args.objective,
          trigger,
          targets: selectorsMeanAllDevices(args.devices) ? { kind: "all" } : { kind: "devices", selectors: args.devices ?? [] },
          intensity: args.intensity,
          speak: args.speak,
          vibrate: args.vibrate,
          sound: args.sound,
          escalation:
            args.escalate_after_seconds !== undefined
              ? {
                  afterSeconds: args.escalate_after_seconds,
                  toIntensity: args.escalate_to ?? "urgent",
                  expandToAllDevices: args.escalate_to_all_devices ?? false,
                }
              : undefined,
          maxRingSeconds: args.max_ring_seconds,
          responseOptions: args.response_options,
          client: user.client,
        });
        const hint =
          alarm.responseOptions.length > 0
            ? `\nCall get_alarm with alarm_id="${alarm.id}" and wait_seconds to wait for the user's answer.`
            : "";
        return result(`${formatAlarm(alarm, now())}${hint}`, { alarm });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "get_alarm",
    {
      title: "Get alarm status",
      description:
        "Get an alarm's status, per-device delivery and the user's response. With wait_seconds, blocks until the alarm is acknowledged/missed/cancelled or the wait elapses (max 50s; call again to keep waiting).",
      inputSchema: z.object({
        alarm_id: z.string().describe("The id returned by create_alarm."),
        wait_seconds: z.number().min(0).max(50).optional(),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ alarm_id, wait_seconds }, ctx) => {
      try {
        const { backend } = resolve(ctx.http?.authInfo);
        const deadline = now() + (wait_seconds ?? 0) * 1000;
        let alarm = await backend.getAlarm(alarm_id);
        while (!TERMINAL.has(alarm.status) && now() < deadline) {
          await sleep(Math.min(pollIntervalMs, Math.max(deadline - now(), 0)));
          alarm = await backend.getAlarm(alarm_id);
        }
        const waiting =
          !TERMINAL.has(alarm.status) && wait_seconds
            ? "\nStill waiting for the user — call get_alarm again to keep waiting."
            : "";
        return result(`${formatAlarm(alarm, now())}${waiting}`, { alarm });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "list_alarms",
    {
      title: "List alarms",
      description: "List recent alarms, optionally filtered by status (e.g. 'scheduled' to see pending ones).",
      inputSchema: z.object({
        status: z.enum(["scheduled", "ringing", "acknowledged", "missed", "cancelled"]).optional(),
        limit: z.number().int().min(1).max(50).optional(),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ status, limit }, ctx) => {
      try {
        const alarms = await resolve(ctx.http?.authInfo).backend.listAlarms({ status, limit });
        const text =
          alarms.length === 0 ? "No matching alarms." : alarms.map((a) => formatAlarm(a, now())).join("\n\n");
        return result(text, { alarms });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "reschedule_alarm",
    {
      title: "Reschedule alarm",
      description:
        "Move a scheduled (or currently ringing) alarm to a new time. Use it to push back a dead man's switch while you are still working.",
      inputSchema: z.object({ alarm_id: z.string(), ...whenFields }),
    },
    async ({ alarm_id, ...when }, ctx) => {
      try {
        const alarm = await resolve(ctx.http?.authInfo).backend.rescheduleAlarm(alarm_id, parseWhen(when));
        return result(formatAlarm(alarm, now()), { alarm });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "cancel_alarm",
    {
      title: "Cancel alarm",
      description: "Cancel a scheduled alarm, or silence one that is ringing on all devices.",
      inputSchema: z.object({ alarm_id: z.string() }),
      annotations: { destructiveHint: true },
    },
    async ({ alarm_id }, ctx) => {
      try {
        const alarm = await resolve(ctx.http?.authInfo).backend.cancelAlarm(alarm_id);
        return result(formatAlarm(alarm, now()), { alarm });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerPrompt(
    "wake-me-when-done",
    {
      title: "Wake me when done",
      description: "Instructs the agent to ring the user's devices when the current task finishes or gets blocked.",
      argsSchema: z.object({
        how: z
          .string()
          .optional()
          .describe("Optional preferences, e.g. 'softly on my phone, loud if it failed'."),
      }),
    },
    ({ how }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `I'm stepping away. Keep working on the current task. When it's finished, use the Alarm MCP create_alarm tool to wake me with a short summary of the outcome. If you get blocked (for example on a permission prompt or a question only I can answer), create a gentle alarm with response_options for the choices and wait for my answer with get_alarm. ${how ? `My preferences: ${how}` : ""}`.trim(),
          },
        },
      ],
    }),
  );
}
