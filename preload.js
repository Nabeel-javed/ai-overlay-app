'use strict';
const { contextBridge, ipcRenderer } = require('electron');
function listen(channel, callback) {
  const listener = (_event, value) => callback(value);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: value => ipcRenderer.invoke('save-settings', value),
  getConnections: () => ipcRenderer.invoke('get-connections'),
  submit: request => ipcRenderer.invoke('call-ai', request),
  cancel: (id, provider) => ipcRenderer.invoke('cancel-request', id, provider),
  newChat: () => ipcRenderer.invoke('new-chat'),
  capture: () => ipcRenderer.invoke('capture-screenshot'),
  removeScreenshot: () => ipcRenderer.send('remove-screenshot'),
  dismiss: () => ipcRenderer.send('dismiss-overlay'),
  openSettings: () => ipcRenderer.send('open-settings'),
  getHistory: () => ipcRenderer.invoke('get-history'),
  getHistoryEntry: id => ipcRenderer.invoke('get-history-entry', id),
  resumeHistory: id => ipcRenderer.invoke('resume-history', id),
  onEvent: callback => listen('ai-event', callback),
  onSettings: callback => listen('settings-changed', callback),
  onScreenshot: callback => listen('screenshot-captured', callback),
  onReset: callback => listen('reset-tool', callback),
  onRefresh: callback => listen('refresh-tool', callback),
  onFocus: callback => listen('focus-input', callback),
  onNotification: callback => listen('notification', callback),
  onHistoryChanged: callback => listen('history-changed', callback),
});
