'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('settingsAPI', {
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: settings => ipcRenderer.invoke('save-settings', settings),
  getConnections: () => ipcRenderer.invoke('get-connections'),
  connect: provider => ipcRenderer.invoke('connect-provider', provider),
  openGuide: provider => ipcRenderer.send('open-setup-guide', provider),
  clearHistory: () => ipcRenderer.invoke('clear-history'),
  closeWindow: () => ipcRenderer.send('close-settings-window'),
});
