// preload_api_key.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('apiKeyPromptAPI', {
    // Renderer -> Main (Request/Response)
    // Now accepts both API key and provider type
    saveKey: (apiData) => ipcRenderer.invoke('save-api-key', apiData)
});