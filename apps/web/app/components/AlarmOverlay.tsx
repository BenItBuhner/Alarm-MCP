"use client";

import type { DeviceAlarm } from "@alarm-mcp/backend/shared";
import { useEffect, useState } from "react";
import { playAlarm, speak } from "@/lib/sounds";

export function AlarmOverlay({
  alarm,
  onRespond,
}: {
  alarm: DeviceAlarm;
  onRespond: (action: "dismiss" | "respond" | "snooze", option?: string) => void;
}) {
  const [left, setLeft] = useState(0);

  useEffect(() => {
    const stop = playAlarm(alarm.sound, alarm.intensity);
    if (alarm.speak) setTimeout(() => speak(`${alarm.title}. ${alarm.message ?? ""}`), 600);
    const endsAt = (alarm.firedAt ?? Date.now()) + alarm.maxRingSeconds * 1000;
    const tick = () => setLeft(Math.max(0, Math.round((endsAt - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => {
      stop();
      window.speechSynthesis?.cancel();
      clearInterval(id);
    };
  }, [alarm.alarmId, alarm.intensity, alarm.sound, alarm.speak, alarm.firedAt, alarm.maxRingSeconds, alarm.title, alarm.message]);

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 px-8 ${
        alarm.intensity === "urgent" ? "alarm-urgent bg-[#1a0c0e]" : "bg-ink/95"
      }`}
    >
      <span className="relative flex h-3.5 w-3.5">
        <span className="pulse-ring absolute inset-0 rounded-full bg-glow" />
        <span className="relative h-3.5 w-3.5 rounded-full bg-glow" />
      </span>
      <h1 className={`max-w-xl text-center font-medium tracking-tight ${alarm.intensity === "urgent" ? "text-5xl" : "text-3xl"}`}>
        {alarm.title}
      </h1>
      {alarm.message && <p className="max-w-lg text-center text-mute">{alarm.message}</p>}
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {alarm.responseOptions.map((option) => (
          <button
            key={option}
            className="rounded-full bg-glow px-5 py-2.5 text-sm font-medium text-ink"
            onClick={() => onRespond("respond", option)}
          >
            {option}
          </button>
        ))}
        <button
          className={
            alarm.responseOptions.length === 0
              ? "rounded-full bg-glow px-5 py-2.5 text-sm font-medium text-ink"
              : "rounded-full border border-line px-5 py-2.5 text-sm"
          }
          onClick={() => onRespond("dismiss")}
        >
          {alarm.responseOptions.length === 0 ? "I'm up" : "Dismiss"}
        </button>
        <button className="rounded-full border border-line px-5 py-2.5 text-sm" onClick={() => onRespond("snooze")}>
          Snooze 5 min
        </button>
      </div>
      <p className="text-xs text-mute">
        {alarm.intensity} · stops in {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}
      </p>
    </div>
  );
}
