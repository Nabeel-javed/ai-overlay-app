// preload.js
const { contextBridge, ipcRenderer } = require('electron');

// Expose specific IPC channels to the renderer process securely
// This acts as a bridge, allowing the renderer (UI) to communicate
// with the main process (Node.js backend) without exposing
// powerful Node.js APIs directly to the frontend code.
contextBridge.exposeInMainWorld('electronAPI', {

  // Channel: main process -> renderer process (one-way)
  // Listens for a message from the main process telling the renderer
  // to focus the main input text area. Triggered by Cmd/Ctrl+Shift+O.
  // Usage in renderer.js: window.electronAPI.onFocusInput(() => { inputTextArea.focus(); });
  onFocusInput: (callback) => ipcRenderer.on('focus-input', (event, ...args) => callback(...args)),

  // Channel: renderer process -> main process (one-way)
  // Sends a message from the renderer (e.g., when the Dismiss button is clicked)
  // to the main process, telling it to hide the overlay window.
  // Usage in renderer.js: window.electronAPI.sendDismissOverlay();
  sendDismissOverlay: () => ipcRenderer.send('dismiss-overlay'),

  // Channel: renderer process <-> main process (request/response)
  // Sends text from the renderer's input field to the main process,
  // invokes the 'call-gemini' handler in the main process (which makes the API call),
  // and returns the result (success or error) back to the renderer.
  // Usage in renderer.js: const result = await window.electronAPI.invokeCallGemini(text);
  invokeCallGemini: (text) => ipcRenderer.invoke('call-gemini', text),

  // New channel: main process -> renderer process (one-way)
  // Receives the screenshot as a data URL from the main process
  // Usage in renderer.js: window.electronAPI.onScreenshotCaptured((dataUrl) => { ... });
  onScreenshotCaptured: (callback) => ipcRenderer.on('screenshot-captured', (event, dataUrl) => callback(dataUrl)),

  // New channel: main process -> renderer process (one-way)
  // Listens for a message from the main process to clear the screenshot
  // Usage in renderer.js: window.electronAPI.onClearScreenshot(() => { ... });
  onClearScreenshot: (callback) => ipcRenderer.on('clear-screenshot', (event) => callback()),

  // New channel: renderer process -> main process (one-way)
  // Sends a message to the main process to remove the screenshot
  // Usage in renderer.js: window.electronAPI.sendRemoveScreenshot();
  sendRemoveScreenshot: () => ipcRenderer.send('remove-screenshot'),

  // New channel: main process -> renderer process (one-way)
  // Listens for a message from the main process to reset the tool
  // Usage in renderer.js: window.electronAPI.onResetTool(() => { ... });
  onResetTool: (callback) => ipcRenderer.on('reset-tool', (event) => callback()),

  // New channel: renderer process -> main process (one-way)
  // Sends a message to the main process to open the settings window
  // Usage in renderer.js: window.electronAPI.openSettings();
  openSettings: () => ipcRenderer.send('open-settings'),

  // Add this new API for license updates
  onLicenseUpdate: (callback) => {
    ipcRenderer.on('license-status-update', (event, data) => {
      callback(data);
    })
  },

  // New channels for reasoning toggle
  getReasoningState: () => ipcRenderer.invoke('get-reasoning-state'),
  toggleReasoning: (newState) => ipcRenderer.send('toggle-reasoning', newState)
});

console.log('Preload script executed');
