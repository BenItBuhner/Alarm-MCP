import type { Intensity, Sound } from "@alarm-mcp/backend/shared";

/** Synthesized alarm sounds (no audio assets). Returns a stop function. */
export function playAlarm(sound: Sound, intensity: Intensity): () => void {
  const ctx = new AudioContext();
  const master = ctx.createGain();
  master.connect(ctx.destination);
  const peak = intensity === "gentle" ? 0.18 : intensity === "normal" ? 0.5 : 0.9;
  master.gain.setValueAtTime(intensity === "gentle" ? peak : peak * 0.3, ctx.currentTime);
  if (intensity !== "gentle") master.gain.linearRampToValueAtTime(peak, ctx.currentTime + 20);

  const tone = (freq: number, start: number, duration: number, type: OscillatorType, level = 1) => {
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    env.gain.setValueAtTime(0, start);
    env.gain.linearRampToValueAtTime(level, start + 0.02);
    env.gain.exponentialRampToValueAtTime(0.001, start + duration);
    osc.connect(env).connect(master);
    osc.start(start);
    osc.stop(start + duration + 0.05);
    return osc;
  };

  const patterns: Record<Sound, { period: number; play: (t: number) => void }> = {
    chime: {
      period: intensity === "gentle" ? 8 : 4,
      play: (t) => {
        tone(880, t, 1.6, "sine");
        tone(1318.5, t + 0.35, 1.8, "sine", 0.7);
      },
    },
    beacon: {
      period: 1.2,
      play: (t) => {
        tone(988, t, 0.18, "triangle");
        tone(740, t + 0.3, 0.18, "triangle");
      },
    },
    klaxon: {
      period: 0.9,
      play: (t) => {
        const osc = tone(520, t, 0.7, "sawtooth", 0.8);
        osc.frequency.linearRampToValueAtTime(1040, t + 0.6);
      },
    },
  };

  const pattern = patterns[sound];
  let next = ctx.currentTime + 0.1;
  let rounds = 0;
  const schedule = () => {
    while (next < ctx.currentTime + 1.5) {
      if (intensity !== "gentle" || rounds < 3 || rounds % 4 === 0) pattern.play(next);
      next += pattern.period;
      rounds++;
    }
  };
  schedule();
  const timer = setInterval(schedule, 500);
  return () => {
    clearInterval(timer);
    void ctx.close();
  };
}

export function speak(text: string): void {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.95;
  window.speechSynthesis.speak(utterance);
}
