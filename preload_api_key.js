// preload_api_key.js
const { contextBridge, ipcRenderer, shell } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // Updated to match the new function name
    saveApiKey: (apiData) => ipcRenderer.invoke('save-api-key', apiData),

    // Add function to open external links
    openExternalLink: (url) => {
        shell.openExternal(url);
    }
});