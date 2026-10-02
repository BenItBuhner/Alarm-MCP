import type { Doc, Id } from "../_generated/dataModel";
import { DEFAULT_MAX_RING_SECONDS, LIMITS } from "./shared";
import type { AlarmSpec, Intensity, Platform, Sound, Trigger } from "./validators";

const INTENSITY_RANK: Record<Intensity, number> = { gentle: 0, normal: 1, urgent: 2 };

export function louder(a: Intensity, b: Intensity): Intensity {
  return INTENSITY_RANK[a] >= INTENSITY_RANK[b] ? a : b;
}

export function computeFireAt(trigger: Trigger, now: number): number {
  switch (trigger.kind) {
    case "now":
      return now;
    case "in":
      if (!Number.isFinite(trigger.seconds) || trigger.seconds < 0) {
        throw new Error("trigger.seconds must be a non-negative number");
      }
      if (trigger.seconds * 1000 > LIMITS.scheduleHorizonMs) {
        throw new Error("Alarms can be scheduled at most 30 days ahead");
      }
      return now + Math.round(trigger.seconds * 1000);
    case "at":
      if (!Number.isFinite(trigger.at)) throw new Error("trigger.at must be a timestamp");
      if (trigger.at - now > LIMITS.scheduleHorizonMs) {
        throw new Error("Alarms can be scheduled at most 30 days ahead");
      }
      // Times slightly in the past (clock skew, slow agents) fire immediately.
      if (trigger.at < now - 60_000) {
        throw new Error("trigger.at is in the past");
      }
      return Math.max(trigger.at, now);
  }
}

const PLATFORM_ALIASES: Record<Platform, string[]> = {
  android: ["android", "phone", "mobile", "cell", "cellphone", "smartphone", "tablet"],
  desktop: ["desktop", "computer", "pc", "laptop", "mac", "macbook", "windows", "linux", "workstation"],
};

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Resolves natural-language device selectors ("my phone", "work laptop", a device id)
 * to concrete active devices. Unmatched selectors are reported so the agent can fix them.
 */
export function resolveDeviceSelectors(
  devices: Doc<"devices">[],
  selectors: string[],
): { deviceIds: Id<"devices">[]; unmatched: string[] } {
  const matched = new Set<Id<"devices">>();
  const unmatched: string[] = [];
  for (const raw of selectors) {
    const selector = normalize(raw);
    if (!selector) continue;
    if (["all", "every", "everything", "all devices", "every device"].includes(selector)) {
      devices.forEach((d) => matched.add(d._id));
      continue;
    }
    const byId = devices.find((d) => d._id === raw.trim());
    if (byId) {
      matched.add(byId._id);
      continue;
    }
    const stripped = selector.replace(/^(my|the|our)\s+/, "");
    const byName = devices.filter((d) => {
      const name = normalize(d.name);
      return name === stripped || name.includes(stripped) || stripped.includes(name);
    });
    if (byName.length > 0) {
      byName.forEach((d) => matched.add(d._id));
      continue;
    }
    const words = stripped.split(" ");
    const byPlatform = devices.filter((d) =>
      PLATFORM_ALIASES[d.platform].some((alias) => words.includes(alias)),
    );
    if (byPlatform.length > 0) {
      byPlatform.forEach((d) => matched.add(d._id));
      continue;
    }
    unmatched.push(raw);
  }
  return { deviceIds: [...matched], unmatched };
}

export type NormalizedSpec = {
  title: string;
  message?: string;
  objective?: string;
  intensity: Intensity;
  speak: boolean;
  vibrate: boolean;
  sound: Sound;
  escalation?: AlarmSpec["escalation"];
  maxRingSeconds: number;
  responseOptions: string[];
};

const DEFAULT_SOUND: Record<Intensity, Sound> = {
  gentle: "chime",
  normal: "beacon",
  urgent: "klaxon",
};

function clampText(value: string | undefined, max: number): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

export function normalizeSpec(spec: AlarmSpec): NormalizedSpec {
  const title = clampText(spec.title, LIMITS.titleMax);
  if (!title) throw new Error("Alarm title is required");

  const responseOptions = [
    ...new Set((spec.responseOptions ?? []).map((o) => o.trim()).filter(Boolean)),
  ];
  if (responseOptions.length > LIMITS.responseOptionsMax) {
    throw new Error(`At most ${LIMITS.responseOptionsMax} response options are allowed`);
  }
  if (responseOptions.some((o) => o.length > LIMITS.responseOptionMax)) {
    throw new Error(`Response options must be at most ${LIMITS.responseOptionMax} characters`);
  }

  const maxRingSeconds = spec.maxRingSeconds ?? DEFAULT_MAX_RING_SECONDS[spec.intensity];
  if (
    !Number.isFinite(maxRingSeconds) ||
    maxRingSeconds < LIMITS.maxRingSecondsMin ||
    maxRingSeconds > LIMITS.maxRingSecondsMax
  ) {
    throw new Error(
      `maxRingSeconds must be between ${LIMITS.maxRingSecondsMin} and ${LIMITS.maxRingSecondsMax}`,
    );
  }

  if (spec.escalation) {
    const { afterSeconds } = spec.escalation;
    if (
      !Number.isFinite(afterSeconds) ||
      afterSeconds < LIMITS.escalationAfterMin ||
      afterSeconds > LIMITS.escalationAfterMax
    ) {
      throw new Error(
        `escalation.afterSeconds must be between ${LIMITS.escalationAfterMin} and ${LIMITS.escalationAfterMax}`,
      );
    }
    if (afterSeconds >= maxRingSeconds) {
      throw new Error("escalation.afterSeconds must be shorter than maxRingSeconds");
    }
  }

  return {
    title,
    message: clampText(spec.message, LIMITS.messageMax),
    objective: clampText(spec.objective, LIMITS.objectiveMax),
    intensity: spec.intensity,
    speak: spec.speak ?? false,
    vibrate: spec.vibrate ?? spec.intensity !== "gentle",
    sound: spec.sound ?? DEFAULT_SOUND[spec.intensity],
    escalation: spec.escalation,
    maxRingSeconds: Math.round(maxRingSeconds),
    responseOptions,
  };
}
