'use strict';
const { BrowserWindow, Menu, screen, desktopCapturer, systemPreferences } = require('electron');
const path = require('node:path');

class Windows {
  constructor(storage, { root, newChat }) {
    this.storage = storage; this.root = root; this.newChat = newChat;
    this.main = null; this.settings = null; this.capturing = false;
  }
  secure(window) {
    window.setContentProtection(true);
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', event => event.preventDefault());
    window.webContents.on('will-attach-webview', event => event.preventDefault());
  }
  send(channel, value) {
    if (this.main && !this.main.isDestroyed()) this.main.webContents.send(channel, value);
  }
  notify(message) { this.send('notification', message); }
  openMain() {
    if (this.main && !this.main.isDestroyed()) return this.focus();
    const saved = this.storage.getWindowState() || {};
    const work = screen.getPrimaryDisplay().workArea;
    this.main = new BrowserWindow({
      width: Math.min(saved.width || 560, work.width), height: Math.min(saved.height || 640, work.height),
      minWidth: 460, minHeight: 440, frame: false, transparent: process.platform === 'darwin',
      backgroundColor: '#202124', alwaysOnTop: true, skipTaskbar: true, resizable: true,
      opacity: Math.max(0.2, Math.min(1, saved.opacity || 1)), show: false,
      webPreferences: { preload: path.join(this.root, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    if (Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
      const area = screen.getDisplayMatching({ x: saved.x, y: saved.y, width: 560, height: 640 }).workArea;
      this.main.setPosition(Math.max(area.x, Math.min(saved.x, area.x + area.width - 200)), Math.max(area.y, Math.min(saved.y, area.y + area.height - 200)));
    }
    this.secure(this.main);
    this.main.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    this.main.loadFile(path.join(this.root, 'index.html'));
    this.main.once('ready-to-show', () => this.main?.show());
    this.main.on('close', () => this.saveState());
    this.main.on('closed', () => { this.main = null; });
    const menu = Menu.buildFromTemplate([
      { label: 'Settings', click: () => this.openSettings() },
      { label: 'New chat', click: () => this.newChat().catch(error => this.notify(error.message)) },
      { type: 'separator' }, { role: 'quit' },
    ]);
    this.main.webContents.on('context-menu', () => menu.popup());
  }
  openSettings() {
    if (this.settings && !this.settings.isDestroyed()) { this.settings.focus(); return; }
    this.settings = new BrowserWindow({
      width: 540, height: Math.min(750, screen.getPrimaryDisplay().workArea.height), minHeight: 480,
      title: 'Spectro Settings', parent: this.main || undefined, modal: false, show: false,
      backgroundColor: '#202124',
      webPreferences: { preload: path.join(this.root, 'preload_settings.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    this.secure(this.settings);
    this.settings.loadFile(path.join(this.root, 'settings.html'));
    this.settings.once('ready-to-show', () => this.settings?.show());
    this.settings.on('closed', () => { this.settings = null; });
  }
  focus() {
    if (!this.main || this.main.isDestroyed()) this.openMain();
    this.main.show(); this.main.focus(); this.send('focus-input');
  }
  toggle() { this.main?.isVisible() ? this.main.hide() : this.focus(); }
  saveState() {
    if (!this.main || this.main.isDestroyed()) return;
    this.storage.saveWindowState({ ...this.main.getBounds(), opacity: this.main.getOpacity() });
  }
  move(x, y) {
    if (!this.main?.isVisible()) return;
    const [left, top] = this.main.getPosition();
    this.main.setPosition(left + x, top + y); this.saveState();
  }
  opacity(delta) {
    if (!this.main?.isVisible()) return;
    this.main.setOpacity(Math.max(0.2, Math.min(1, this.main.getOpacity() + delta))); this.saveState();
  }
  resizeForScreenshot(attached) {
    if (!this.main || this.main.isDestroyed()) return;
    const area = screen.getDisplayMatching(this.main.getBounds()).workArea;
    const [width, height] = this.main.getSize();
    if (attached) { this.heightBeforeCapture ??= height; this.main.setSize(width, Math.min(area.height, Math.max(height, 780))); }
    else if (this.heightBeforeCapture) { this.main.setSize(width, this.heightBeforeCapture); this.heightBeforeCapture = null; }
  }
  async capture() {
    if (this.capturing) return;
    if (process.platform === 'darwin' && systemPreferences.getMediaAccessStatus('screen') === 'denied') {
      throw new Error('Allow Spectro in macOS System Settings → Privacy & Security → Screen Recording, then restart the app.');
    }
    this.capturing = true;
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const settingsVisible = this.settings?.isVisible();
    this.main?.hide(); this.settings?.hide();
    try {
      await new Promise(resolve => setTimeout(resolve, 150));
      const ratio = Math.min(1, 2000 / Math.max(display.size.width, display.size.height));
      const sources = await desktopCapturer.getSources({ types: ['screen'],
        thumbnailSize: { width: Math.round(display.size.width * ratio), height: Math.round(display.size.height * ratio) } });
      const source = sources.find(item => item.display_id === String(display.id)) || (sources.length === 1 ? sources[0] : null);
      if (!source || source.thumbnail.isEmpty()) throw new Error('No screenshot was captured. Check macOS Screen Recording permission.');
      const dataUrl = `data:image/jpeg;base64,${source.thumbnail.toJPEG(85).toString('base64')}`;
      this.focus(); this.resizeForScreenshot(true); this.send('screenshot-captured', dataUrl);
      return { ok: true };
    } finally {
      this.capturing = false; this.main?.show();
      if (settingsVisible) this.settings?.show();
    }
  }
}
module.exports = { Windows };
