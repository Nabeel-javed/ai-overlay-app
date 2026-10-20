'use strict';
const fs = require('node:fs/promises');
const { cleanEnvironment, findBinary, collect, checkVersion, ProviderError, abortError } = require('./runtime');
const { SYSTEM_PROMPT, userText } = require('../models');

function assistantText(message) {
  return (message.message?.content || []).filter(block => block.type === 'text').map(block => block.text).join('\n');
}

function classifyClaudeMessage(message) {
  if (message.type === 'assistant' && message.error) {
    return new ProviderError(assistantText(message) || 'Claude could not answer.', message.error === 'rate_limit' || message.error === 'billing_error' ? 'QUOTA_EXCEEDED' : message.error);
  }
  // Some CLI releases label synthetic subscription-limit responses as successful results.
  if (message.type === 'result' && !Object.keys(message.modelUsage || {}).length &&
      /(?:hit your|reached your|exceeded|out of).*(?:limit|credits)|usage limit|spend limit/i.test(message.result || '')) {
    return new ProviderError(message.result, 'QUOTA_EXCEEDED');
  }
  if (message.type === 'result' && (message.is_error || message.subtype !== 'success')) {
    return new ProviderError(message.errors?.join('\n') || message.result || 'Claude could not complete the request.', 'CLAUDE_ERROR');
  }
  return null;
}

class ClaudeProvider {
  constructor(cwd, queryFactory) { this.cwd = cwd; this.queryFactory = queryFactory; this.active = new Set(); }
  async runtime() {
    await fs.mkdir(this.cwd, { recursive: true, mode: 0o700 });
    const binary = await findBinary('claude');
    const version = checkVersion((await collect(binary, ['--version'])).stdout, '2.1.304', 'Claude Code');
    return { binary, version };
  }
  async status() {
    try {
      const { binary, version } = await this.runtime();
      const result = await collect(binary, ['auth', 'status', '--json'], { cwd: this.cwd });
      const auth = JSON.parse(result.stdout);
      const authenticated = !!auth.loggedIn && auth.authMethod === 'claude.ai' && auth.apiProvider === 'firstParty';
      return { installed: true, authenticated, version, plan: auth.subscriptionType || null,
        message: authenticated ? `Connected · ${auth.subscriptionType || 'Claude'}` : 'Sign into Claude Code with your Claude subscription.' };
    } catch (error) { return { installed: error.code !== 'NOT_INSTALLED', authenticated: false, message: error.message, code: error.code }; }
  }
  async login() {
    const { binary } = await this.runtime();
    const result = await collect(binary, ['auth', 'login'], { cwd: this.cwd, timeout: 180000 });
    if (result.code !== 0) throw new ProviderError('Claude sign-in did not finish. Run claude auth login in Terminal, then refresh connections.', 'AUTH_REQUIRED');
    return { started: true, message: 'Sign-in completed. Refresh connections.' };
  }
  async options(model, session) {
    const { binary } = await this.runtime();
    return {
      cwd: this.cwd, model, pathToClaudeCodeExecutable: binary,
      env: { ...cleanEnvironment(), CLAUDE_AGENT_SDK_CLIENT_APP: 'spectro/2.0.0' },
      systemPrompt: SYSTEM_PROMPT, tools: [], skills: [], settingSources: [], mcpServers: {},
      strictMcpConfig: true, permissionMode: 'dontAsk', canUseTool: async () => ({ behavior: 'deny', message: 'Tools are disabled in Spectro.' }),
      settings: { disableAllHooks: true, autoMemoryEnabled: false },
      extraArgs: { restricted: null, 'disable-slash-commands': null },
      includePartialMessages: true, maxTurns: 1,
      ...(session?.sessionId ? { resume: session.sessionId } : {}),
      ...(session?.messageId ? { resumeSessionAt: session.messageId, forkSession: true } : {}),
    };
  }
  /** @type {import('../contracts').Adapter['run']} */
  async run(request, session, { signal, emit }) {
    const auth = await this.status();
    if (!auth.authenticated) throw new ProviderError(auth.message, auth.code || 'AUTH_REQUIRED');
    if (signal.aborted) throw abortError();
    const query = this.queryFactory || (await import('@anthropic-ai/claude-agent-sdk')).query;
    const content = [{ type: 'text', text: userText(request) }];
    if (request.screenshot) {
      const [prefix, data] = request.screenshot.split(',');
      content.push({ type: 'image', source: { type: 'base64', media_type: prefix.slice(5, -7), data } });
    }
    async function* messages() {
      yield { type: 'user', message: { role: 'user', content }, parent_tool_use_id: null, session_id: session?.sessionId || '' };
    }
    const q = query({ prompt: messages(), options: await this.options(request.model, session) });
    this.active.add(q);
    let killTimer;
    const cancel = () => {
      q.interrupt().catch(() => {});
      killTimer = setTimeout(() => q.close(), 2000);
    };
    signal.addEventListener('abort', cancel, { once: true });
    let text = '';
    let actualModel;
    let messageId;
    let failure;
    try {
      if (signal.aborted) { cancel(); throw abortError(); }
      for await (const message of q) {
        if (signal.aborted) throw abortError();
        const error = classifyClaudeMessage(message);
        if (error) failure ||= error;
        if (message.type === 'system' && message.subtype === 'init') {
          actualModel = message.model;
          if (message.tools?.length || message.mcp_servers?.length) throw new ProviderError('Claude loaded unexpected tools. Request stopped.', 'CONFIG_ERROR');
          emit({ type: 'model', model: actualModel });
        } else if (message.type === 'rate_limit_event') {
          emit({ type: 'usage', usage: message.rate_limit_info });
        } else if (message.type === 'stream_event' && !message.parent_tool_use_id &&
            message.event.type === 'content_block_delta' && message.event.delta.type === 'text_delta') {
          const delta = message.event.delta.text;
          text += delta;
          if (text.length > 2 * 1024 * 1024) throw new ProviderError('Response exceeded the size limit.');
          emit({ type: 'delta', text: delta });
        } else if (message.type === 'assistant' && !message.parent_tool_use_id) {
          messageId = message.uuid;
          if (message.message.model && message.message.model !== '<synthetic>') actualModel = message.message.model;
        } else if (message.type === 'result') {
          if (failure) throw failure;
          return { text: message.result || text, actualModel, sessionId: message.session_id, messageId, usage: message.usage };
        }
      }
      throw failure || new ProviderError('Claude exited without completing the response.', 'CLIENT_EXIT');
    } catch (error) {
      if (signal.aborted) throw abortError();
      throw error;
    } finally {
      clearTimeout(killTimer);
      signal.removeEventListener('abort', cancel);
      this.active.delete(q);
      q.close();
    }
  }
  async fork(entry) {
    if (!entry.messageId) throw new ProviderError('This response cannot be resumed. Start a new chat.');
    return { sessionId: entry.sessionId, messageId: entry.messageId };
  }
  close() { for (const query of this.active) query.close(); this.active.clear(); }
}
module.exports = { ClaudeProvider, classifyClaudeMessage };
