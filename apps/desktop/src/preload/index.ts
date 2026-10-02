import { contextBridge, ipcRenderer } from "electron";
import { IPC, type AlarmMcpBridge } from "../shared/bridge";

const bridge: AlarmMcpBridge = {
  getState: () => ipcRenderer.invoke(IPC.getState),
  onState: (callback) => {
    ipcRenderer.on(IPC.stateChanged, (_event, state) => callback(state));
  },
  pair: (input) => ipcRenderer.invoke(IPC.pair, input),
  unpair: () => ipcRenderer.invoke(IPC.unpair),
  setLaunchAtLogin: (enabled) => ipcRenderer.invoke(IPC.setLaunchAtLogin, enabled),
  testAlarm: (intensity) => ipcRenderer.invoke(IPC.testAlarm, intensity),
  getAlarm: () => ipcRenderer.invoke(IPC.getAlarm),
  onAlarmUpdate: (callback) => {
    ipcRenderer.on(IPC.alarmUpdated, (_event, alarm) => callback(alarm));
  },
  respond: (input) => ipcRenderer.invoke(IPC.respond, input),
};

contextBridge.exposeInMainWorld("alarmMcp", bridge);
