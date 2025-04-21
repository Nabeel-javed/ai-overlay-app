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
    saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),

    // Channel: renderer -> main (one-way)
    // Requests that the main process close the settings window
    // Usage: window.electronAPI.closeSettingsWindow();
    closeSettingsWindow: () => ipcRenderer.send('close-settings-window'),

    // Channel: renderer -> main (one-way)
    // Combined operation: save settings and close the window in one operation
    // Usage: window.electronAPI.saveAndClose(settings);
    saveAndClose: (settings) => ipcRenderer.send('save-and-close', settings)
}); 