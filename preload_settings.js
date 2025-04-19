const { contextBridge, ipcRenderer } = require('electron');

// Expose specific IPC channels to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
    // Channel: renderer -> main (request/response)
    // Gets the current settings from the main process
    // Usage: const settings = await window.electronAPI.getSettings();
    getSettings: () => ipcRenderer.invoke('get-settings'),

    // Channel: renderer -> main (request/response)
    // Saves updated settings to the main process
    // Usage: const result = await window.electronAPI.saveSettings(settings);
    saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings)
}); 