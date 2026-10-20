'use strict';
const fs = require('node:fs/promises');
const { JsonRpc } = require('./json-rpc');
const { cleanEnvironment, findBinary, collect, checkVersion, ProviderError, abortError } = require('./runtime');
const { ASTRA, SYSTEM_PROMPT, userText } = require('../models');

const FLAGS = {
  shell_tool: false, unified_exec: false, apply_patch_freeform: false,
  include_apply_patch_tool: false, multi_agent: false, plugins: false,
  codex_hooks: false, apps: false, connectors: false, memories: false,
  memory_tool: false, js_repl: false, tool_search: false, tool_suggest: false,
  image_generation: false, shell_snapshot: false,
};

class CodexProvider {
  constructor(cwd) { this.cwd = cwd; this.rpc = null; this.starting = null; this.threads = new Set(); }
  async start() {
    if (this.rpc && !this.rpc.closed) return this.rpc;
    if (this.starting) return this.starting;
    this.starting = this.initialize().finally(() => { this.starting = null; });
    return this.starting;
  }
  async initialize() {
    await fs.mkdir(this.cwd, { recursive: true, mode: 0o700 });
    const binary = await findBinary('codex');
    this.version = checkVersion((await collect(binary, ['--version'])).stdout, '0.163.0', 'Codex');
    const config = { ...Object.fromEntries(Object.entries(FLAGS).map(([key, value]) => [`features.${key}`, value])),
      model_provider: 'openai', web_search: 'disabled', project_doc_max_bytes: 0,
      model_reasoning_effort: 'low', service_tier: 'default', 'tools.view_image': false };
    const args = ['app-server', '--listen', 'stdio://'];
    for (const [key, value] of Object.entries(config)) args.push('-c', `${key}=${JSON.stringify(value)}`);
    const rpc = new JsonRpc(binary, args, { cwd: this.cwd, env: cleanEnvironment() });
    this.rpc = rpc;
    this.threads.clear();
    try {
      await rpc.request('initialize', { clientInfo: { name: 'spectro', title: 'Spectro', version: '2.0.0' } });
      rpc.send({ method: 'initialized', params: {} });
      const result = await rpc.request('config/read', { includeLayers: false });
      // Empty TOML tables merge with user config; disable each existing server explicitly.
      this.threadConfig = { ...config, mcp_servers: Object.fromEntries(
        Object.keys(result.config?.mcp_servers || {}).map(name => [name, { enabled: false }])
      ) };
      return rpc;
    } catch (error) { rpc.close(); throw error; }
  }
  async status() {
    try {
      const rpc = await this.start();
      const { account } = await rpc.request('account/read', { refreshToken: false });
      const models = [];
      let cursor;
      do {
        const result = await rpc.request('model/list', { limit: 100, includeHidden: false, ...(cursor ? { cursor } : {}) });
        models.push(...result.data);
        cursor = result.nextCursor;
      } while (cursor);
      const astra = models.find(m => m.model === ASTRA);
      const authenticated = account?.type === 'chatgpt';
      return {
        installed: true, authenticated, version: this.version, plan: account?.planType || null,
        model: ASTRA, available: !!astra, efforts: astra?.supportedReasoningEfforts?.map(x => x.reasoningEffort) || [],
        message: authenticated ? (astra ? `Connected · ${account.planType || 'ChatGPT'}` : 'Connected; Astra is not listed for this account.')
          : 'Sign into Codex with ChatGPT. API-key authentication is not used by Spectro.',
      };
    } catch (error) { return { installed: error.code !== 'NOT_INSTALLED', authenticated: false, message: error.message, code: error.code }; }
  }
  async login(openUrl) {
    const rpc = await this.start();
    const result = await rpc.request('account/login/start', { type: 'chatgpt' });
    if (!result.authUrl) throw new ProviderError('Codex did not return a sign-in URL.');
    await openUrl(result.authUrl);
    return { started: true, message: 'Complete sign-in in your browser, then refresh connections.' };
  }
  threadOptions() {
    return { cwd: this.cwd, model: ASTRA, modelProvider: 'openai', sandbox: 'read-only',
      approvalPolicy: 'untrusted', baseInstructions: SYSTEM_PROMPT, developerInstructions: '',
      config: this.threadConfig };
  }
  /** @type {import('../contracts').Adapter['run']} */
  async run(request, session, { signal, emit }) {
    const rpc = await this.start();
    if (signal.aborted) throw abortError();
    const { account } = await rpc.request('account/read', { refreshToken: false });
    if (account?.type !== 'chatgpt') throw new ProviderError('Sign into Codex with ChatGPT in Settings.', 'AUTH_REQUIRED');
    let threadId = session?.sessionId;
    if (!threadId) {
      const result = await rpc.request('thread/start', this.threadOptions());
      threadId = result.thread.id;
      this.threads.add(threadId);
    } else if (!this.threads.has(threadId)) {
      await rpc.request('thread/resume', { ...this.threadOptions(), threadId, excludeTurns: true });
      this.threads.add(threadId);
    }
    if (signal.aborted) throw abortError();
    const input = [{ type: 'text', text: userText(request) }];
    if (request.screenshot) input.push({ type: 'image', url: request.screenshot });
    let turnId;
    let text = '';
    let actualModel = ASTRA;
    let usage;
    let finished = false;
    let cancelTimer;
    let interruptSent = false;
    let finish;
    let fail;
    const completed = new Promise((resolve, reject) => { finish = resolve; fail = reject; });
    // Attach a handler before turn/start so a fast error cannot become an unhandled rejection.
    completed.catch(() => {});
    const cancel = () => {
      if (turnId && !interruptSent) {
        interruptSent = true;
        rpc.request('turn/interrupt', { threadId, turnId }, 5000).catch(() => {});
      }
      cancelTimer ??= setTimeout(() => { rpc.close(); fail(abortError()); }, 5000);
    };
    const notification = (method, params) => {
      if (params?.threadId !== threadId) return;
      if (method === 'turn/started') {
        turnId = params.turn.id;
        if (signal.aborted) cancel();
      } else if (method === 'item/agentMessage/delta') {
        text += params.delta;
        if (text.length > 2 * 1024 * 1024) { rpc.close(); fail(new ProviderError('Response exceeded the size limit.')); return; }
        emit({ type: 'delta', text: params.delta });
      } else if (method === 'model/rerouted') {
        actualModel = params.toModel;
        emit({ type: 'model', model: actualModel });
      } else if (method === 'thread/tokenUsage/updated') {
        usage = params.tokenUsage?.last;
      } else if (method === 'item/completed' && params.item?.type === 'agentMessage' && !text) {
        text = params.item.text || '';
      } else if (method === 'turn/completed') {
        finished = true;
        if (signal.aborted || params.turn.status === 'interrupted') fail(abortError());
        else if (params.turn.status !== 'completed') fail(new ProviderError(params.turn.error?.message || 'Codex could not complete the request.', 'CODEX_ERROR'));
        else finish({ text, actualModel, sessionId: threadId, turnId: params.turn.id, usage });
      }
    };
    const disconnected = error => fail(signal.aborted ? abortError() : error);
    rpc.on('notification', notification);
    rpc.on('disconnect', disconnected);
    signal.addEventListener('abort', cancel, { once: true });
    try {
      const result = await rpc.request('turn/start', {
        threadId, input, model: ASTRA, effort: request.effort, serviceTierForTurn: 'default',
        sandboxPolicy: { type: 'readOnly', networkAccess: false }, approvalPolicy: 'untrusted',
      });
      turnId = result.turn.id;
      if (signal.aborted && !finished) cancel();
      return await completed;
    } finally {
      clearTimeout(cancelTimer);
      rpc.off('notification', notification);
      rpc.off('disconnect', disconnected);
      signal.removeEventListener('abort', cancel);
    }
  }
  async fork(entry) {
    const rpc = await this.start();
    const result = await rpc.request('thread/fork', { threadId: entry.sessionId, lastTurnId: entry.turnId, excludeTurns: true });
    // Resume with the overlay's restrictive config before the next turn.
    return { sessionId: result.thread.id };
  }
  close() { this.rpc?.close(); }
}
module.exports = { CodexProvider };
