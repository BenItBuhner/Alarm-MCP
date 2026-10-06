import { app, safeStorage } from "electron";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export type StoredConfig = {
  convexUrl: string;
  deviceName?: string;
  userName?: string;
  deviceToken?: string;
};

type OnDisk = Omit<StoredConfig, "deviceToken"> & {
  deviceToken?: { encrypted: boolean; value: string };
};

const file = () => join(app.getPath("userData"), "config.json");

export function loadConfig(defaultConvexUrl: string): StoredConfig {
  try {
    if (!existsSync(file())) return { convexUrl: defaultConvexUrl };
    const raw = JSON.parse(readFileSync(file(), "utf8")) as OnDisk;
    let deviceToken: string | undefined;
    if (raw.deviceToken) {
      deviceToken = raw.deviceToken.encrypted
        ? safeStorage.decryptString(Buffer.from(raw.deviceToken.value, "base64"))
        : raw.deviceToken.value;
    }
    return {
      convexUrl: raw.convexUrl || defaultConvexUrl,
      deviceName: raw.deviceName,
      userName: raw.userName,
      deviceToken,
    };
  } catch (error) {
    console.error("Failed to read config, starting unpaired", error);
    return { convexUrl: defaultConvexUrl };
  }
}

export function saveConfig(config: StoredConfig): void {
  const { deviceToken, ...rest } = config;
  const onDisk: OnDisk = { ...rest };
  if (deviceToken) {
    const encrypted = safeStorage.isEncryptionAvailable();
    onDisk.deviceToken = {
      encrypted,
      value: encrypted
        ? safeStorage.encryptString(deviceToken).toString("base64")
        : deviceToken,
    };
  }
  mkdirSync(dirname(file()), { recursive: true });
  writeFileSync(file(), JSON.stringify(onDisk, null, 2), { mode: 0o600 });
}
