'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { StringDecoder } = require('node:string_decoder');
const { cleanEnvironment, findBinary, collect, checkVersion, ProviderError, abortError } = require('./runtime');
const { GROK, SYSTEM_PROMPT, userText } = require('../models');

// Use a separate native config/session directory and the CLI's supported auth-path
// override. Spectro never reads or copies the credential itself.
const CONFIG = `
[auth]
disable_api_key_auth = true
[memory]
enabled = false
[skills]
ignore = ["/"]
[toolset.bash]
login_shell_capture = false
[telemetry]
enabled = false
trace_upload = false
${['claude', 'cursor', 'codex'].map(vendor => `[compat.${vendor}]
skills = false
rules = false
agents = false
mcps = false
hooks = false
sessions = false`).join('\n')}
`;

class GrokProvider {
  constructor(cwd) { this.cwd = cwd; this.active = new Set(); this.shutdown = new AbortController(); }
  runtime() {
    this.runtimePromise ||= this.prepare().catch(error => { this.runtimePromise = null; throw error; });
    return this.runtimePromise;
  }
  async prepare() {
    const home = path.join(this.cwd, 'client');
    const work = path.join(this.cwd, 'work');
    await fs.mkdir(home, { recursive: true, mode: 0o700 });
    await fs.mkdir(work, { recursive: true, mode: 0o700 });
    await fs.writeFile(path.join(home, 'config.toml'), CONFIG, { mode: 0o600 });
    const binary = await findBinary('grok');
    const env = {
      ...cleanEnvironment(), GROK_HOME: home,
      GROK_AUTH_PATH: path.join(os.homedir(), '.grok', 'auth.json'),
      GROK_DISABLE_API_KEY_AUTH: '1',
      GROK_MEMORY: '0', GROK_SUBAGENTS: '0', GROK_WORKFLOWS: '0',
      GROK_MANAGED_MCPS_ENABLED: '0', GROK_MANAGED_MCP_GATEWAY_TOOLS_ENABLED: '0',
      GROK_WEB_FETCH: '0', GROK_TELEMETRY_ENABLED: '0', GROK_TELEMETRY_TRACE_UPLOAD: '0',
      GROK_DISABLE_AUTOUPDATER: '1',
    };
    const signal = this.shutdown.signal;
    if (signal.aborted) throw abortError();
    const version = checkVersion((await collect(binary, ['--version'], { env, cwd: work, signal })).stdout, '1.0.62', 'Grok');
    // Grok also discovers Claude marketplace plugins independently of compat cells.
    // inspect is local discovery only; disable every discovered plugin before starting a session.
    const inspected = await collect(binary, ['inspect', '--json'], { env, cwd: work, signal, maxBytes: 4 * 1024 * 1024 });
    if (inspected.code !== 0) throw new ProviderError('Could not inspect Grok configuration.', 'CONFIG_ERROR');
    const config = JSON.parse(inspected.stdout);
    if (config.projectRoot) throw new ProviderError('Grok runtime must be outside a source repository.', 'CONFIG_ERROR');
    const disabled = (config.plugins || []).map(plugin => plugin.name);
    await fs.writeFile(path.join(home, 'config.toml'), `${CONFIG}\n[plugins]\ndisabled = ${JSON.stringify(disabled)}\n`, { mode: 0o600 });
    if (signal.aborted) throw abortError();
    return { binary, env, cwd: work, version, signal };
  }
  async status() {
    try {
      const runtime = await this.runtime();
      const result = await collect(runtime.binary, ['models'], runtime);
      const authenticated = result.code === 0 && /You are logged in with grok\.com\./.test(result.stdout);
      const available = result.stdout.includes(GROK);
      return { installed: true, authenticated: authenticated && available, version: runtime.version,
        message: !authenticated ? 'Sign into Grok with your subscription.' : !available ? 'Grok 4.7 is unavailable in this client.' : 'Connected · Grok subscription' };
    } catch (error) { return { installed: error.code !== 'NOT_INSTALLED', authenticated: false, message: error.message, code: error.code }; }
  }
  async login() {
    const runtime = await this.runtime();
    const result = await collect(runtime.binary, ['login', '--oauth'], { ...runtime, timeout: 180000 });
    if (result.code !== 0) throw new ProviderError('Grok sign-in did not finish. Run grok login --oauth in Terminal, then refresh connections.', 'AUTH_REQUIRED');
    return { started: true, message: 'Grok sign-in completed.' };
  }
  async run(request, session, { signal, emit }) {
    const auth = await this.status();
    if (!auth.authenticated) throw new ProviderError(auth.message, auth.code || 'AUTH_REQUIRED');
    if (signal.aborted) throw abortError();
    const runtime = await this.runtime();
    const directory = await fs.mkdtemp(path.join(this.cwd, 'prompt-'));
    const file = path.join(directory, 'input.json');
    const content = [{ type: 'text', text: userText(request) }];
    if (request.screenshot) {
      const [prefix, data] = request.screenshot.split(',');
      content.push({ type: 'image', mimeType: prefix.slice(5, -7), data });
    }
    try {
      await fs.writeFile(file, JSON.stringify(content), { mode: 0o600 });
      if (signal.aborted) throw abortError();
      return await this.stream(runtime, [
        '--prompt-file', file, '--model', GROK, '--reasoning-effort', request.effort,
        '--output-format', 'streaming-messages-json', '--include-partial-messages',
        '--system-prompt-override', SYSTEM_PROMPT, '--verbatim', '--no-leader',
        '--tools', 'read_file', '--disallowed-tools', 'read_file,search_tool,use_tool,Agent',
        '--permission-mode', 'dontAsk', '--no-subagents', '--no-plan',
        '--disable-web-search', '--max-turns', '1',
        ...(session?.sessionId ? ['--resume', session.sessionId] : []),
      ], signal, emit);
    } finally { await fs.rm(directory, { recursive: true, force: true }); }
  }
  stream(runtime, args, signal, emit) {
    return new Promise((resolve, reject) => {
      const child = spawn(runtime.binary, args, { cwd: runtime.cwd, env: runtime.env, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
      this.active.add(child);
      let text = '', buffer = '', result, failure, actualModel = GROK, initialized = false, killTimer;
      const decoder = new StringDecoder('utf8');
      const stop = () => {
        child.kill('SIGTERM');
        killTimer ||= setTimeout(() => child.kill('SIGKILL'), 1500);
        killTimer.unref();
      };
      const fail = error => { failure ||= error; stop(); };
      const message = value => {
        if (failure) return;
        if (value.type === 'system' && value.subtype === 'init') {
          if (value.apiKeySource !== 'oauth' || value.model !== GROK || value.tools?.length || value.mcp_servers?.length || value.skills?.length) {
            return fail(new ProviderError('Grok loaded unexpected authentication or tools. Request stopped.', 'CONFIG_ERROR'));
          }
          initialized = true;
          actualModel = value.model || GROK;
          emit({ type: 'model', model: actualModel });
        } else if (value.type === 'stream_event' && value.event?.type === 'content_block_delta' && value.event.delta?.type === 'text_delta') {
          if (!initialized) return fail(new ProviderError('Grok streamed before confirming its configuration.', 'CONFIG_ERROR'));
          text += value.event.delta.text;
          if (text.length > 2 * 1024 * 1024) return fail(new ProviderError('Response exceeded the size limit.'));
          emit({ type: 'delta', text: value.event.delta.text });
        } else if (value.type === 'result') {
          if (value.is_error || value.subtype !== 'success') {
            return fail(new ProviderError(value.errors?.join('\n') || value.result || 'Grok could not answer.', 'GROK_ERROR'));
          }
          if (value.stop_reason && !['end_turn', 'stop_sequence'].includes(value.stop_reason)) {
            return fail(new ProviderError(`Grok stopped before completing the answer (${value.stop_reason}).`, 'INCOMPLETE_RESPONSE'));
          }
          result = { text: value.result || text, actualModel, sessionId: value.session_id, usage: value.usage };
        } else if (value.type === 'error') fail(new ProviderError(value.message || 'Grok failed.', 'GROK_ERROR'));
      };
      const parse = chunk => {
        buffer += chunk;
        if (buffer.length > 12 * 1024 * 1024) return fail(new ProviderError('Grok sent an oversized message.'));
        let boundary;
        while ((boundary = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 1);
          if (!line.trim()) continue;
          try { message(JSON.parse(line)); } catch { return fail(new ProviderError('Grok sent an invalid protocol message.')); }
        }
      };
      child.stdout.on('data', chunk => parse(decoder.write(chunk)));
      child.stderr.on('data', () => {}); // Never forward account data or prompts.
      child.on('error', error => { failure = new ProviderError(error.message, 'CLIENT_ERROR'); });
      child.on('close', code => {
        parse(decoder.end() + (buffer ? '\n' : ''));
        clearTimeout(killTimer); signal.removeEventListener('abort', stop); this.active.delete(child);
        if (signal.aborted) reject(abortError());
        else if (failure) reject(failure);
        else if (code !== 0 || !initialized || !result) reject(new ProviderError('Grok exited without a completed answer.', 'CLIENT_EXIT'));
        else resolve(result);
      });
      signal.addEventListener('abort', stop, { once: true });
      if (signal.aborted) stop();
    });
  }
  async fork() { throw new ProviderError('Saved Grok answers cannot yet be resumed at an exact turn. Start a new chat.'); }
  close() {
    this.shutdown.abort();
    for (const child of this.active) {
      child.kill('SIGTERM');
      const timer = setTimeout(() => child.kill('SIGKILL'), 1500); timer.unref();
    }
  }
}
module.exports = { GrokProvider };
