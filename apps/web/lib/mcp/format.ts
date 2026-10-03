import { isOnline, type AlarmView, type DeviceView } from "@alarm-mcp/backend/shared";

export function describeTime(ms: number, now: number): string {
  const iso = new Date(ms).toISOString();
  const delta = Math.round((ms - now) / 1000);
  if (Math.abs(delta) < 5) return `${iso} (now)`;
  const abs = Math.abs(delta);
  const human =
    abs < 90 ? `${abs}s` : abs < 5400 ? `${Math.round(abs / 60)}m` : `${(abs / 3600).toFixed(1)}h`;
  return `${iso} (${delta > 0 ? `in ${human}` : `${human} ago`})`;
}

export function formatDevices(devices: DeviceView[], now: number): string {
  if (devices.length === 0) {
    return "No devices are paired. Ask the user to install the Alarm MCP desktop or Android app and pair it from the dashboard.";
  }
  return devices
    .map((d) => {
      const caps = Object.entries(d.capabilities)
        .filter(([, enabled]) => enabled)
        .map(([name]) => name)
        .join(", ");
      const online = isOnline(d.lastSeenAt, now) ? "online" : `offline (last seen ${describeTime(d.lastSeenAt, now)})`;
      return `- ${d.name} [${d.platform}] id=${d.id} — ${online}; capabilities: ${caps || "none"}${d.pushEnabled ? "; push wake enabled" : ""}`;
    })
    .join("\n");
}

export function formatAlarm(alarm: AlarmView, now: number): string {
  const lines = [
    `Alarm ${alarm.id}: "${alarm.title}" — status: ${alarm.status.toUpperCase()}`,
    `Intensity: ${alarm.currentIntensity}${alarm.currentIntensity !== alarm.intensity ? ` (escalated from ${alarm.intensity})` : ""}`,
    `Fires: ${describeTime(alarm.fireAt, now)}`,
    `Targets: ${alarm.targetMode === "all" ? "all devices" : alarm.targetDeviceNames.join(", ")}`,
  ];
  if (alarm.responseOptions.length > 0) {
    lines.push(`Response options: ${alarm.responseOptions.join(" / ")}`);
  }
  if (alarm.response) {
    const what =
      alarm.response.action === "respond"
        ? `responded "${alarm.response.option}"`
        : alarm.response.action === "snooze"
          ? "snoozed"
          : "dismissed (acknowledged)";
    lines.push(`User ${what} on ${alarm.response.deviceName} at ${new Date(alarm.response.at).toISOString()}`);
  }
  if (alarm.deliveries.length > 0) {
    lines.push(
      `Deliveries: ${alarm.deliveries.map((d) => `${d.deviceName}=${d.status}${d.seenAt ? " (seen)" : ""}`).join(", ")}`,
    );
  }
  return lines.join("\n");
}
