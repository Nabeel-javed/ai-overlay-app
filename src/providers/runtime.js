'use strict';
const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

class ProviderError extends Error {
  constructor(message, code = 'PROVIDER_ERROR') {
    super(message);
    this.code = code;
  }
}

function cleanEnvironment() {
  // Do not inherit API keys, alternate gateways, GLM settings, or parent-agent flags.
  const env = {};
  for (const key of ['HOME', 'USER', 'LOGNAME', 'SHELL', 'TMPDIR', 'LANG', 'LC_ALL', 'SystemRoot', 'APPDATA', 'LOCALAPPDATA']) {
    if (process.env[key]) env[key] = process.env[key];
  }
  env.PATH = [path.join(os.homedir(), '.local', 'bin'), path.join(os.homedir(), '.grok', 'bin'), '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin', process.env.PATH || ''].join(path.delimiter);
  return env;
}

async function findBinary(name) {
  const filename = process.platform === 'win32' ? `${name}.exe` : name;
  const candidates = [...new Set(cleanEnvironment().PATH.split(path.delimiter))].filter(Boolean);
  for (const dir of candidates) {
    const file = path.join(dir, filename);
    try { await fs.access(file, fs.constants.X_OK); return file; } catch {}
  }
  throw new ProviderError(`${{ codex: 'Codex', claude: 'Claude Code', grok: 'Grok' }[name] || name} is not installed. Open Settings for setup instructions.`, 'NOT_INSTALLED');
}

function collect(binary, args, { cwd, env = cleanEnvironment(), timeout = 20000, signal, maxBytes = 1024 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { cwd, env, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const done = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      error ? reject(error) : resolve(value);
    };
    const stop = () => { child.kill('SIGTERM'); const timer = setTimeout(() => child.kill('SIGKILL'), 1500); timer.unref(); };
    const abort = () => { stop(); done(new ProviderError('Request cancelled.', 'CANCELLED')); };
    const timer = setTimeout(() => { stop(); done(new ProviderError('The client did not respond in time.', 'TIMEOUT')); }, timeout);
    child.stdout.on('data', chunk => {
      stdout += chunk;
      if (stdout.length > maxBytes) { stop(); done(new ProviderError('Client output exceeded the limit.')); }
    });
    child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-4000); });
    child.on('error', error => done(new ProviderError(error.message, 'CLIENT_ERROR')));
    child.on('close', code => done(null, { code, stdout, stderr }));
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
  });
}

function checkVersion(actual, minimum, name) {
  const parsed = actual.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!parsed) throw new ProviderError(`Could not read ${name}'s version.`, 'CLIENT_VERSION');
  const a = parsed.slice(1).map(Number);
  const b = minimum.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (a[i] > b[i]) break;
    if (a[i] < b[i]) throw new ProviderError(`Update ${name} to ${minimum} or later. Installed: ${a.join('.')}.`, 'CLIENT_VERSION');
  }
  return a.join('.');
}

function abortError() { return new ProviderError('Request cancelled.', 'CANCELLED'); }

module.exports = { ProviderError, cleanEnvironment, findBinary, collect, checkVersion, abortError };
