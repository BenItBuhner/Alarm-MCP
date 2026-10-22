import type { Intensity } from "@alarm-mcp/backend/shared";

const INSTALL_KEY = "alarm-mcp.installationId";
const TOKEN_KEY = "alarm-mcp.deviceToken";
const NAME_KEY = "alarm-mcp.deviceName";
const INTENSITY_KEY = "alarm-mcp.defaultIntensity";

const WEB_CAPABILITIES = {
  sound: true,
  vibrate: false,
  fullScreen: true,
  speak: true,
  actions: true,
} as const;

export function webCapabilities() {
  return WEB_CAPABILITIES;
}

export function getInstallationId(): string {
  let id = localStorage.getItem(INSTALL_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(INSTALL_KEY, id);
  }
  return id;
}

export function loadBrowserDevice(): { token: string; name: string; intensity: Intensity } | null {
  const token = localStorage.getItem(TOKEN_KEY);
  const name = localStorage.getItem(NAME_KEY);
  const intensity = localStorage.getItem(INTENSITY_KEY);
  if (!token || !name) return null;
  return {
    token,
    name,
    intensity: intensity === "gentle" || intensity === "urgent" ? intensity : "normal",
  };
}

export function saveBrowserDevice(token: string, name: string, intensity: Intensity): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(NAME_KEY, name);
  localStorage.setItem(INTENSITY_KEY, intensity);
}

export function clearBrowserDevice(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(NAME_KEY);
  localStorage.removeItem(INTENSITY_KEY);
}
