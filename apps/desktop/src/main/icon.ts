import { nativeImage, type NativeImage } from "electron";

type Rgb = [number, number, number];

/** Draws a simple alarm-bell glyph at runtime so the app ships without binary assets. */
export function trayIcon(color: Rgb, size = 32): NativeImage {
  const buffer = Buffer.alloc(size * size * 4);
  const c = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - c;
      const dy = y + 0.5 - c * 1.08;
      const r = Math.hypot(dx, dy);
      const ring = r < size * 0.4 && r > size * 0.29;
      const handAngle = Math.atan2(dy, dx);
      const hand =
        r < size * 0.24 &&
        ((Math.abs(dx) < size * 0.04 && dy < 0) || (Math.abs(handAngle) < 0.25 && dx > 0));
      const leftBell = Math.hypot(x + 0.5 - size * 0.2, y + 0.5 - size * 0.16) < size * 0.12;
      const rightBell = Math.hypot(x + 0.5 - size * 0.8, y + 0.5 - size * 0.16) < size * 0.12;
      const on = ring || hand || leftBell || rightBell;
      const i = (y * size + x) * 4;
      // BGRA
      buffer[i] = color[2];
      buffer[i + 1] = color[1];
      buffer[i + 2] = color[0];
      buffer[i + 3] = on ? 255 : 0;
    }
  }
  return nativeImage.createFromBitmap(buffer, { width: size, height: size });
}

export const ICON_COLORS = {
  connected: [255, 181, 71] as Rgb,
  offline: [140, 140, 150] as Rgb,
  ringing: [255, 80, 80] as Rgb,
};
