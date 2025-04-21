const { contextBridge, ipcRenderer } = require('electron');

// Expose specific IPC channels to the renderer process
contextBridge.exposeInMainWorld('settingsAPI', {
    // Get current settings
    getSettings: () => ipcRenderer.invoke('get-settings'),

    // Save settings
    saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),

    // Close window without saving
    closeWindow: () => ipcRenderer.send('close-settings-window')
}); 