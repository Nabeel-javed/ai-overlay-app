'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { normalizeSettings, validateSettings } = require('./models');

function migrateLegacyData(legacy = {}) {
  return {
    schemaVersion: 2,
    settings: normalizeSettings(legacy),
    windowState: legacy.windowState,
    sessions: {},
    responseHistory: (Array.isArray(legacy.responseHistory) ? legacy.responseHistory : []).slice(-50).map(entry => ({
      ...entry, id: String(entry.id || crypto.randomUUID()), format: 'legacy', status: 'completed',
    })),
  };
}

class AppStorage {
  constructor(store, directory, key) {
    this.store = store;
    this.directory = path.join(directory, 'attachments');
    this.key = key;
    fs.mkdirSync(this.directory, { recursive: true, mode: 0o700 });
  }
  getSettings() { return normalizeSettings(this.store.get('settings')); }
  setSettings(settings) { const next = validateSettings(settings); this.store.set('settings', next); return next; }
  getSession(provider) { return this.store.get('sessions', {})[provider] || null; }
  setSession(provider, session) { this.store.set('sessions', { ...this.store.get('sessions', {}), [provider]: session }); }
  resetSessions() { this.store.set('sessions', {}); }
  getWindowState() { return this.store.get('windowState'); }
  saveWindowState(state) { this.store.set('windowState', state); }
  saveAttachment(dataUrl) {
    if (!dataUrl) return null;
    const name = crypto.createHash('sha256').update(dataUrl).digest('hex') + '.bin';
    const destination = path.join(this.directory, name);
    if (!fs.existsSync(destination)) {
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', this.key, iv);
      const encrypted = Buffer.concat([cipher.update(dataUrl, 'utf8'), cipher.final()]);
      fs.writeFileSync(destination, Buffer.concat([iv, cipher.getAuthTag(), encrypted]), { mode: 0o600, flag: 'wx' });
    }
    return name;
  }
  readAttachment(name) {
    if (!name || !/^[a-f0-9]{64}\.bin$/.test(name)) return null;
    const bytes = fs.readFileSync(path.join(this.directory, name));
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.key, bytes.subarray(0, 12));
    decipher.setAuthTag(bytes.subarray(12, 28));
    return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8');
  }
  history() {
    return this.store.get('responseHistory', []).map(({ screenshot, ...entry }) => ({ ...entry, hasScreenshot: !!(screenshot || entry.attachment) }));
  }
  entry(id) {
    const entry = this.store.get('responseHistory', []).find(item => String(item.id) === String(id));
    if (!entry) throw new Error('Saved response not found.');
    return { ...entry, screenshot: entry.screenshot || this.readAttachment(entry.attachment) };
  }
  archive(entry) {
    const { screenshot, ...data } = entry;
    const saved = { ...data, attachment: this.saveAttachment(screenshot), id: crypto.randomUUID(), timestamp: new Date().toISOString(), format: 'markdown', status: 'completed' };
    const history = [...this.store.get('responseHistory', []), saved].slice(-50);
    this.store.set('responseHistory', history);
    this.pruneAttachments(history);
    return saved;
  }
  pruneAttachments(history) {
    const keep = new Set(history.map(item => item.attachment).filter(Boolean));
    for (const file of fs.readdirSync(this.directory)) {
      if (/^[a-f0-9]{64}\.bin$/.test(file) && !keep.has(file)) fs.unlinkSync(path.join(this.directory, file));
    }
  }
  clearHistory() { this.store.set('responseHistory', []); this.pruneAttachments([]); }
}

async function createStorage(directory, safeStorage) {
  const Store = (await import('electron-store')).default;
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const keyPath = path.join(directory, 'spectro-storage-key');
  if (!safeStorage.isEncryptionAvailable()) throw new Error('macOS secure storage is unavailable. Unlock your login keychain and restart Spectro.');
  const key = fs.existsSync(keyPath)
    ? Buffer.from(safeStorage.decryptString(fs.readFileSync(keyPath)), 'hex')
    : crypto.randomBytes(32);
  if (key.length !== 32) throw new Error('The Spectro storage key is invalid.');
  if (!fs.existsSync(keyPath)) fs.writeFileSync(keyPath, safeStorage.encryptString(key.toString('hex')), { mode: 0o600, flag: 'wx' });
  const store = new Store({ cwd: directory, name: 'spectro-v2', encryptionKey: key, clearInvalidConfig: false });
  if (!store.has('schemaVersion')) {
    let legacy = {};
    const oldPath = path.join(directory, 'config.json');
    if (fs.existsSync(oldPath)) {
      // Import only app state. Keep the original file intact for rollback; never expose its keys.
      try {
        const encryptionKey = process.platform === 'darwin' ? 'spectro-encryption-key' : require('node-machine-id').machineIdSync();
        legacy = new Store({ cwd: directory, name: 'config', encryptionKey, clearInvalidConfig: false }).store;
      } catch {
        try { legacy = JSON.parse(fs.readFileSync(oldPath, 'utf8')); }
        catch { throw new Error('Existing Spectro settings could not be read. The original file has been preserved.'); }
      }
    }
    store.store = migrateLegacyData(legacy);
  }
  fs.chmodSync(store.path, 0o600);
  const storage = new AppStorage(store, directory, key);
  const settings = storage.getSettings();
  if (store.get('settings')?.claudeModel !== settings.claudeModel) storage.setSettings(settings);
  // Move inline screenshots out of the settings document without changing old response text.
  const history = store.get('responseHistory', []);
  if (history.some(entry => entry.screenshot)) {
    store.set('responseHistory', history.map(({ screenshot, ...entry }) => ({
      ...entry, attachment: screenshot ? storage.saveAttachment(screenshot) : entry.attachment,
    })));
  }
  return storage;
}
module.exports = { AppStorage, createStorage, migrateLegacyData };
