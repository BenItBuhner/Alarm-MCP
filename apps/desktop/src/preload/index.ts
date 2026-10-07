import { contextBridge, ipcRenderer } from "electron";
import { IPC, type AlarmMcpBridge } from "../shared/bridge";

const bridge: AlarmMcpBridge = {
  getState: () => ipcRenderer.invoke(IPC.getState),
  onState: (callback) => {
    ipcRenderer.on(IPC.stateChanged, (_event, state) => callback(state));
  },
  clerkSignIn: () => ipcRenderer.invoke(IPC.clerkSignIn),
  registerDevice: (input) => ipcRenderer.invoke(IPC.registerDevice, input),
  signOut: () => ipcRenderer.invoke(IPC.signOut),
  setLaunchAtLogin: (enabled) => ipcRenderer.invoke(IPC.setLaunchAtLogin, enabled),
  getAlarm: () => ipcRenderer.invoke(IPC.getAlarm),
  onAlarmUpdate: (callback) => {
    ipcRenderer.on(IPC.alarmUpdated, (_event, alarm) => callback(alarm));
  },
  respond: (input) => ipcRenderer.invoke(IPC.respond, input),
};

contextBridge.exposeInMainWorld("alarmMcp", bridge);
