import type { DeviceAlarm } from "@alarm-mcp/backend/shared";
import { playAlarm, speak } from "./sounds";

const $ = (id: string) => document.getElementById(id)!;
const bridge = window.alarmMcp;

let stopSound: (() => void) | null = null;
let countdown: ReturnType<typeof setInterval> | null = null;
let currentKey = "";

function button(label: string, primary: boolean, onClick: () => void): HTMLButtonElement {
  const el = document.createElement("button");
  el.textContent = label;
  if (primary) el.className = "primary";
  el.addEventListener("click", onClick);
  return el;
}

function respond(alarm: DeviceAlarm, action: "dismiss" | "respond" | "snooze", option?: string, snoozeMinutes?: number) {
  stopSound?.();
  window.speechSynthesis?.cancel();
  void bridge.respond({ alarmId: alarm.alarmId, action, option, snoozeMinutes });
}

function render(alarm: DeviceAlarm): void {
  $("root").className = `alarm ${alarm.intensity}`;
  $("title").textContent = alarm.title;
  $("message").textContent = alarm.message ?? "";
  document.title = `⏰ ${alarm.title}`;

  const actions = $("actions");
  actions.replaceChildren(
    ...alarm.responseOptions.map((option) => button(option, true, () => respond(alarm, "respond", option))),
    button(alarm.responseOptions.length > 0 ? "Dismiss" : "I'm up", alarm.responseOptions.length === 0, () =>
      respond(alarm, "dismiss"),
    ),
    button("Snooze 5 min", false, () => respond(alarm, "snooze", undefined, 5)),
  );

  const key = `${alarm.intensity}:${alarm.sound}`;
  if (key !== currentKey) {
    currentKey = key;
    stopSound?.();
    stopSound = playAlarm(alarm.sound, alarm.intensity);
  }

  if (countdown) clearInterval(countdown);
  const endsAt = (alarm.firedAt ?? Date.now()) + alarm.maxRingSeconds * 1000;
  const tick = () => {
    const left = Math.max(0, Math.round((endsAt - Date.now()) / 1000));
    $("meta").textContent = `${alarm.intensity} · stops ringing in ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
    if (left === 0) {
      stopSound?.();
      if (countdown) clearInterval(countdown);
    }
  };
  tick();
  countdown = setInterval(tick, 1000);
}

void bridge.getAlarm().then((alarm) => {
  if (!alarm) return;
  render(alarm);
  if (alarm.speak) setTimeout(() => speak(`${alarm.title}. ${alarm.message ?? ""}`), 800);
});
bridge.onAlarmUpdate(render);
