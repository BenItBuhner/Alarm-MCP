import { api } from "@alarm-mcp/backend/api";
import { HEARTBEAT_INTERVAL_MS, type DeviceAlarm } from "@alarm-mcp/backend/shared";
import { ConvexClient } from "convex/browser";
import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  Notification,
  powerSaveBlocker,
  screen,
  Tray,
} from "electron";
import { hostname } from "node:os";
import { join } from "node:path";
import { IPC, type AppState, type PairInput, type RespondInput } from "../shared/bridge";
import { backupsToArm, diffRinging, type OpenAlarm, windowModeFor } from "./alarmPlan";
import { ICON_COLORS, trayIcon } from "./icon";
import { loadConfig, saveConfig, type StoredConfig } from "./store";

declare const __APP_VERSION__: string;
declare const __DEFAULT_CONVEX_URL__: string;

const CAPABILITIES = { sound: true, vibrate: false, fullScreen: true, speak: true, actions: true };

let config: StoredConfig;
let client: ConvexClient | null = null;
let unsubscribeFeed: (() => void) | null = null;
let heartbeatTimer: NodeJS.Timeout | null = null;
let tray: Tray | null = null;
let statusWindow: BrowserWindow | null = null;
let connected = false;
let lastError: string | undefined;
let upcoming: DeviceAlarm[] = [];

const shown = new Map<string, OpenAlarm>();
const alarmWindows = new Map<string, BrowserWindow>();
const windowAlarm = new Map<number, string>();
const backupTimers = new Map<string, NodeJS.Timeout>();
let displaySleepBlocker: number | null = null;

function state(): AppState {
  return {
    status: !config.deviceToken ? "unpaired" : !client ? "offline" : connected ? "connected" : "connecting",
    version: __APP_VERSION__,
    convexUrl: config.convexUrl,
    deviceName: config.deviceName,
    userName: config.userName,
    ringingCount: shown.size,
    upcoming: upcoming.map((a) => ({ title: a.title, fireAt: a.fireAt })),
    launchAtLogin: app.getLoginItemSettings().openAtLogin,
    lastError,
  };
}

function broadcastState(): void {
  const current = state();
  statusWindow?.webContents.send(IPC.stateChanged, current);
  if (!tray) return;
  tray.setImage(
    trayIcon(shown.size > 0 ? ICON_COLORS.ringing : current.status === "connected" ? ICON_COLORS.connected : ICON_COLORS.offline),
  );
  tray.setToolTip(`Alarm MCP — ${current.status}${config.deviceName ? ` as ${config.deviceName}` : ""}`);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: `Status: ${current.status}`, enabled: false },
      ...(shown.size > 0 ? [{ label: `${shown.size} alarm(s) ringing`, enabled: false }] : []),
      { type: "separator" },
      { label: config.deviceToken ? "Open Alarm MCP" : "Pair this computer…", click: showStatusWindow },
      { label: "Test gentle alarm", enabled: true, click: () => openTestAlarm("gentle") },
      {
        label: "Launch at login",
        type: "checkbox",
        checked: current.launchAtLogin,
        click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked }),
      },
      { type: "separator" },
      { label: "Quit", click: () => app.quit() },
    ]),
  );
}

function showStatusWindow(): void {
  if (statusWindow && !statusWindow.isDestroyed()) {
    statusWindow.show();
    statusWindow.focus();
    return;
  }
  statusWindow = new BrowserWindow({
    width: 440,
    height: 600,
    resizable: false,
    title: "Alarm MCP",
    backgroundColor: "#0b0d12",
    webPreferences: { preload: join(__dirname, "preload.js"), sandbox: true, contextIsolation: true },
  });
  statusWindow.setMenuBarVisibility(false);
  void statusWindow.loadFile(join(__dirname, "pairing.html"));
  statusWindow.on("closed", () => {
    statusWindow = null;
  });
}

// ---------- Alarm windows ----------

function openAlarmWindow(alarm: DeviceAlarm, local: boolean): void {
  closeAlarmWindow(alarm.alarmId, false);
  shown.set(alarm.alarmId, { alarm, local });

  const mode = windowModeFor(alarm.intensity);
  const display = screen.getPrimaryDisplay().workArea;
  const size = mode === "corner" ? { width: 400, height: 260 } : { width: 560, height: 460 };
  const win = new BrowserWindow({
    ...size,
    x: mode === "corner" ? display.x + display.width - size.width - 16 : undefined,
    y: mode === "corner" ? display.y + display.height - size.height - 16 : undefined,
    frame: false,
    resizable: false,
    skipTaskbar: mode === "corner",
    alwaysOnTop: true,
    fullscreen: mode === "fullscreen",
    show: false,
    backgroundColor: "#0b0d12",
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      sandbox: true,
      contextIsolation: true,
      autoplayPolicy: "no-user-gesture-required",
      backgroundThrottling: false,
    },
  });
  win.setAlwaysOnTop(true, mode === "fullscreen" ? "screen-saver" : "floating");
  if (mode === "fullscreen") win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  windowAlarm.set(win.webContents.id, alarm.alarmId);
  alarmWindows.set(alarm.alarmId, win);
  win.once("ready-to-show", () => {
    if (mode === "corner") win.showInactive();
    else {
      win.show();
      win.focus();
      app.focus({ steal: true });
    }
  });
  win.on("closed", () => {
    windowAlarm.delete(win.webContents.id);
    if (alarmWindows.get(alarm.alarmId) === win) alarmWindows.delete(alarm.alarmId);
  });
  void win.loadFile(join(__dirname, "alarm.html"));

  if (Notification.isSupported()) {
    new Notification({ title: `⏰ ${alarm.title}`, body: alarm.message ?? "", silent: true }).show();
  }
  if (alarm.deliveryId && client && config.deviceToken) {
    void client
      .mutation(api.deviceApi.markSeen, { deviceToken: config.deviceToken, deliveryId: alarm.deliveryId })
      .catch(() => undefined);
  }
  updatePowerBlocker();
  broadcastState();
}

function closeAlarmWindow(alarmId: string, forget = true): void {
  const win = alarmWindows.get(alarmId);
  alarmWindows.delete(alarmId);
  if (win && !win.isDestroyed()) win.destroy();
  if (forget) shown.delete(alarmId);
  updatePowerBlocker();
  broadcastState();
}

function updatePowerBlocker(): void {
  if (shown.size > 0 && displaySleepBlocker === null) {
    displaySleepBlocker = powerSaveBlocker.start("prevent-display-sleep");
  } else if (shown.size === 0 && displaySleepBlocker !== null) {
    powerSaveBlocker.stop(displaySleepBlocker);
    displaySleepBlocker = null;
  }
}

function openTestAlarm(intensity: DeviceAlarm["intensity"]): void {
  const id = `test-${Date.now()}`;
  openAlarmWindow(
    {
      alarmId: id as DeviceAlarm["alarmId"],
      title: "Test alarm",
      message: `This is what a ${intensity} alarm looks like.`,
      intensity,
      speak: false,
      vibrate: false,
      sound: intensity === "gentle" ? "chime" : intensity === "normal" ? "beacon" : "klaxon",
      responseOptions: ["Looks good"],
      fireAt: Date.now(),
      maxRingSeconds: 30,
    },
    true,
  );
}

// ---------- Convex connection ----------

function reconcile(feed: { ringing: DeviceAlarm[]; upcoming: DeviceAlarm[]; device: { name: string } }): void {
  upcoming = feed.upcoming;
  if (feed.device.name !== config.deviceName) {
    config = { ...config, deviceName: feed.device.name };
    saveConfig(config);
  }
  const serverShown = new Map([...shown].filter(([id]) => !id.startsWith("test-")));
  const diff = diffRinging(serverShown, feed.ringing, new Set(feed.upcoming.map((a) => a.alarmId)));
  for (const id of diff.close) closeAlarmWindow(id);
  for (const alarm of diff.open) openAlarmWindow(alarm, false);
  for (const alarm of diff.update) {
    const previous = shown.get(alarm.alarmId);
    if (previous && windowModeFor(previous.alarm.intensity) !== windowModeFor(alarm.intensity)) {
      openAlarmWindow(alarm, false);
    } else {
      shown.set(alarm.alarmId, { alarm, local: false });
      alarmWindows.get(alarm.alarmId)?.webContents.send(IPC.alarmUpdated, alarm);
    }
  }
  armBackups();
  broadcastState();
}

function armBackups(): void {
  for (const timer of backupTimers.values()) clearTimeout(timer);
  backupTimers.clear();
  for (const { alarm, delayMs } of backupsToArm(upcoming, Date.now())) {
    backupTimers.set(
      alarm.alarmId,
      setTimeout(() => {
        if (!shown.has(alarm.alarmId)) openAlarmWindow(alarm, true);
      }, delayMs),
    );
  }
}

function disconnect(): void {
  unsubscribeFeed?.();
  unsubscribeFeed = null;
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = null;
  void client?.close();
  client = null;
  connected = false;
}

function connect(): void {
  disconnect();
  const deviceToken = config.deviceToken;
  if (!deviceToken || !config.convexUrl) return;
  const convex = new ConvexClient(config.convexUrl);
  client = convex;
  convex.subscribeToConnectionState((s) => {
    if (connected !== s.isWebSocketConnected) {
      connected = s.isWebSocketConnected;
      broadcastState();
    }
  });
  unsubscribeFeed = convex.onUpdate(
    api.deviceApi.feed,
    { deviceToken },
    (feed) => {
      lastError = undefined;
      reconcile(feed);
    },
    (error) => {
      lastError = error.message;
      if (/not paired or revoked/.test(error.message)) {
        config = { convexUrl: config.convexUrl };
        saveConfig(config);
        disconnect();
        showStatusWindow();
      }
      broadcastState();
    },
  );
  const beat = () =>
    convex
      .mutation(api.deviceApi.heartbeat, {
        deviceToken,
        appVersion: __APP_VERSION__,
        capabilities: CAPABILITIES,
      })
      .catch((error: Error) => {
        lastError = error.message;
      });
  void beat();
  heartbeatTimer = setInterval(beat, HEARTBEAT_INTERVAL_MS);
  broadcastState();
}

const pendingResponses: RespondInput[] = [];

async function flushResponses(): Promise<void> {
  if (!client || !config.deviceToken) return;
  while (pendingResponses.length > 0) {
    const next = pendingResponses[0]!;
    try {
      await client.mutation(api.deviceApi.respond, {
        deviceToken: config.deviceToken,
        alarmId: next.alarmId as DeviceAlarm["alarmId"],
        action: next.action,
        option: next.option,
        snoozeMinutes: next.snoozeMinutes,
      });
      pendingResponses.shift();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/already|not found|not sent/.test(message)) pendingResponses.shift();
      else return;
    }
  }
}

// ---------- IPC ----------

function registerIpc(): void {
  ipcMain.handle(IPC.getState, () => state());
  ipcMain.handle(IPC.pair, async (_event, input: PairInput) => {
    const convexUrl = input.convexUrl.trim().replace(/\/$/, "");
    try {
      const temp = new ConvexClient(convexUrl);
      const result = await temp.action(api.devices.pair, {
        code: input.code,
        name: input.name.trim() || hostname(),
        platform: "desktop",
        capabilities: CAPABILITIES,
        appVersion: __APP_VERSION__,
      });
      await temp.close();
      config = {
        convexUrl,
        deviceToken: result.deviceToken,
        deviceName: input.name.trim() || hostname(),
        userName: result.userName,
      };
      saveConfig(config);
      connect();
      return { ok: true as const };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false as const, error: message.replace(/^.*?Uncaught Error:\s*/s, "").replace(/\s+at .*$/s, "") };
    }
  });
  ipcMain.handle(IPC.unpair, async () => {
    if (client && config.deviceToken) {
      await client.mutation(api.deviceApi.unpair, { deviceToken: config.deviceToken }).catch(() => undefined);
    }
    disconnect();
    config = { convexUrl: config.convexUrl };
    saveConfig(config);
    broadcastState();
  });
  ipcMain.handle(IPC.setLaunchAtLogin, (_event, enabled: boolean) => {
    app.setLoginItemSettings({ openAtLogin: enabled });
    broadcastState();
  });
  ipcMain.handle(IPC.testAlarm, (_event, intensity: DeviceAlarm["intensity"]) => openTestAlarm(intensity));
  ipcMain.handle(IPC.getAlarm, (event) => {
    const alarmId = windowAlarm.get(event.sender.id);
    return (alarmId && shown.get(alarmId)?.alarm) ?? null;
  });
  ipcMain.handle(IPC.respond, async (_event, input: RespondInput) => {
    closeAlarmWindow(input.alarmId);
    if (input.alarmId.startsWith("test-")) return;
    pendingResponses.push(input);
    await flushResponses();
  });
}

// ---------- App lifecycle ----------

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", showStatusWindow);
  app.on("window-all-closed", () => {
    // Stay alive in the tray; alarms must keep working with no windows open.
  });
  void app.whenReady().then(() => {
    config = loadConfig(__DEFAULT_CONVEX_URL__);
    registerIpc();
    tray = new Tray(trayIcon(ICON_COLORS.offline));
    tray.on("click", showStatusWindow);
    if (config.deviceToken) connect();
    else showStatusWindow();
    broadcastState();
    setInterval(() => void flushResponses(), 10_000);
  });
}
