'use strict';
const { app, ipcMain, dialog, safeStorage, shell, globalShortcut } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { createStorage } = require('./src/storage');
const { CodexProvider } = require('./src/providers/codex');
const { ClaudeProvider } = require('./src/providers/claude');
const { GrokProvider } = require('./src/providers/grok');
const { RequestController } = require('./src/requests');
const { Windows } = require('./src/windows');
const { PROVIDERS } = require('./src/models');

app.name = 'Spectro';
// Automated desktop tests use isolated settings and history.
if (process.env.SPECTRO_TEST_USER_DATA) app.setPath('userData', process.env.SPECTRO_TEST_USER_DATA);
let windows, requests, storage, providers;
const loginPending = new Set();
function broadcastSettings() {
  const settings = storage.getSettings();
  windows.send('settings-changed', settings);
  return settings;
}
function setSettings(value) { storage.setSettings(value); return broadcastSettings(); }
function assertSender(event, pages = ['index.html', 'settings.html']) {
  if (event.senderFrame !== event.sender.mainFrame ||
      !pages.some(page => event.senderFrame?.url === pathToFileURL(path.join(__dirname, page)).href)) {
    throw new Error('Request denied.');
  }
}
function handle(channel, action, pages) {
  ipcMain.handle(channel, (event, ...args) => { assertSender(event, pages); return action(...args); });
}
function on(channel, action) {
  ipcMain.on(channel, (event, ...args) => {
    try { assertSender(event); action(...args); } catch (error) { windows?.notify(error.message); }
  });
}
async function openLoginUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || !['auth.openai.com', 'auth0.openai.com', 'chatgpt.com'].includes(url.hostname)) throw new Error('Unexpected sign-in URL.');
  await shell.openExternal(url.href);
}
async function newChat() { await requests.reset(); windows.clearScreenshot(); windows.send('reset-tool'); }
function refreshView() {
  if (requests.active || requests.restoring) {
    windows.notify('Wait for the response or stop it before refreshing.');
    return;
  }
  windows.clearScreenshot();
  windows.send('refresh-tool');
}
function registerIpc() {
  handle('get-settings', () => storage.getSettings());
  handle('save-settings', setSettings);
  handle('get-connections', async () => Object.fromEntries(
    await Promise.all(PROVIDERS.map(async provider => [provider, await providers[provider].status()]))));
  handle('connect-provider', async provider => {
    if (!PROVIDERS.includes(provider)) throw new Error('Unknown provider.');
    if (loginPending.has(provider)) return { message: 'Sign-in is already open.' };
    loginPending.add(provider);
    try { return await providers[provider].login(openLoginUrl); } finally { loginPending.delete(provider); }
  });
  handle('call-ai', payload => requests.submit(payload), ['index.html']);
  handle('cancel-request', (requestId, provider) => requests.cancel(requestId, provider), ['index.html']);
  handle('new-chat', newChat, ['index.html']);
  handle('get-history', () => storage.history(), ['index.html']);
  handle('get-history-entry', id => storage.entry(id), ['index.html']);
  handle('resume-history', async id => { await requests.restore(id); return broadcastSettings(); }, ['index.html']);
  handle('clear-history', () => { storage.clearHistory(); windows.send('history-changed'); return { ok: true }; });
  handle('capture-screenshot', () => windows.capture(), ['index.html']);
  on('dismiss-overlay', () => windows.hide());
  on('open-settings', () => windows.openSettings());
  on('close-settings-window', () => windows.settings?.close());
  on('remove-screenshot', () => windows.clearScreenshot());
  on('open-setup-guide', provider => {
    const urls = { openai: 'https://learn.chatgpt.com/docs/codex-cli', claude: 'https://code.claude.com/docs/en/setup', grok: 'https://docs.x.ai/build/cli' };
    if (urls[provider]) shell.openExternal(urls[provider]);
  });
}
function registerShortcuts() {
  const choose = provider => setSettings({ ...storage.getSettings(), provider, mode: 'single' });
  const cycle = () => {
    const settings = storage.getSettings();
    const provider = settings.mode === 'compare' ? PROVIDERS[0] : PROVIDERS[PROVIDERS.indexOf(settings.provider) + 1];
    setSettings({ ...settings, ...(provider ? { provider, mode: 'single' } : { mode: 'compare' }) });
  };
  const actions = {
    'CommandOrControl+Shift+O': () => windows.focus(),
    'CommandOrControl+Shift+H': () => windows.toggle(),
    'CommandOrControl+Shift+Escape': () => windows.hide(),
    'CommandOrControl+Shift+S': () => windows.capture().catch(error => windows.notify(error.message)),
    'CommandOrControl+Shift+R': refreshView,
    'CommandOrControl+Shift+P': cycle,
    'CommandOrControl+0': () => setSettings({ ...storage.getSettings(), mode: 'compare' }),
    'CommandOrControl+1': () => choose('openai'),
    'CommandOrControl+2': () => choose('claude'),
    'CommandOrControl+3': () => choose('grok'),
    'CommandOrControl+Alt+Up': () => windows.move(0, -20),
    'CommandOrControl+Alt+Down': () => windows.move(0, 20),
    'CommandOrControl+Alt+Left': () => windows.move(-20, 0),
    'CommandOrControl+Alt+Right': () => windows.move(20, 0),
    'CommandOrControl+[': () => windows.opacity(-0.05),
    'CommandOrControl+]': () => windows.opacity(0.05),
  };
  for (const [key, action] of Object.entries(actions)) {
    if (!globalShortcut.register(key, action)) console.warn(`Shortcut unavailable: ${key}`);
  }
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => windows?.focus());
  app.whenReady().then(async () => {
    if (process.platform === 'darwin') app.dock.hide();
    storage = await createStorage(app.getPath('userData'), safeStorage);
    providers = {
      openai: new CodexProvider(path.join(app.getPath('userData'), 'runtime', 'codex')),
      claude: new ClaudeProvider(path.join(app.getPath('userData'), 'runtime', 'claude')),
      grok: new GrokProvider(path.join(app.getPath('userData'), 'runtime', 'grok')),
    };
    windows = new Windows(storage, { newChat, root: __dirname });
    requests = new RequestController(storage, providers, event => windows.send('ai-event', event));
    registerIpc();
    windows.openMain();
    if (!process.env.SPECTRO_TEST_USER_DATA) registerShortcuts();
    app.on('activate', () => windows.focus());
  }).catch(error => {
    dialog.showErrorBox('Spectro could not start', error.message);
    app.quit();
  });
}
app.on('before-quit', () => { windows?.saveState(); requests?.close(); });
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
