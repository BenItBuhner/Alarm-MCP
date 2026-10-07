import { app, safeStorage } from "electron";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import type { Intensity } from "@alarm-mcp/backend/shared";

export type StoredConfig = {
  convexUrl: string;
  installationId: string;
  deviceName?: string;
  userName?: string;
  deviceToken?: string;
  defaultIntensity?: Intensity;
};

type OnDisk = Omit<StoredConfig, "deviceToken"> & {
  deviceToken?: { encrypted: boolean; value: string };
};

const file = () => join(app.getPath("userData"), "config.json");

function decryptToken(raw: OnDisk["deviceToken"]): string | undefined {
  if (!raw) return undefined;
  return raw.encrypted ? safeStorage.decryptString(Buffer.from(raw.value, "base64")) : raw.value;
}

export function loadConfig(defaultConvexUrl: string): StoredConfig {
  try {
    if (!existsSync(file())) {
      return { convexUrl: defaultConvexUrl, installationId: randomUUID() };
    }
    const raw = JSON.parse(readFileSync(file(), "utf8")) as OnDisk;
    return {
      convexUrl: raw.convexUrl || defaultConvexUrl,
      installationId: raw.installationId || randomUUID(),
      deviceName: raw.deviceName,
      userName: raw.userName,
      defaultIntensity: raw.defaultIntensity,
      deviceToken: decryptToken(raw.deviceToken),
    };
  } catch (error) {
    console.error("Failed to read config, starting signed out", error);
    return { convexUrl: defaultConvexUrl, installationId: randomUUID() };
  }
}

export function saveConfig(config: StoredConfig): void {
  const { deviceToken, ...rest } = config;
  const onDisk: OnDisk = { ...rest };
  if (deviceToken) {
    const encrypted = safeStorage.isEncryptionAvailable();
    onDisk.deviceToken = {
      encrypted,
      value: encrypted ? safeStorage.encryptString(deviceToken).toString("base64") : deviceToken,
    };
  }
  mkdirSync(dirname(file()), { recursive: true });
  writeFileSync(file(), JSON.stringify(onDisk, null, 2), { mode: 0o600 });
}
