'use strict';
const { validateRequest, ASTRA, GROK, OPUS, PROVIDERS } = require('./models');
const { ProviderError } = require('./providers/runtime');

/** Coordinates one immutable request at a time; provider switches affect only later requests. */
class RequestController {
  constructor(storage, providers, emit, timeout = 240000) {
    this.storage = storage; this.providers = providers; this.emit = emit; this.timeout = timeout; this.active = null; this.restoring = null;
  }
  async submit(payload) {
    if (this.active || this.restoring) return { ok: false, code: 'BUSY', error: 'A request or conversation change is already running. Please wait.' };
    let request;
    try { request = validateRequest(payload); } catch (error) { return { ok: false, code: 'INVALID_REQUEST', error: error.message }; }
    const settings = this.storage.getSettings();
    if (settings.mode === 'compare') return this.compare(request, settings);
    const provider = settings.provider;
    request = { ...request, provider, model: this.model(provider), effort: settings.effort };
    const controller = new AbortController();
    let done;
    const active = { id: request.requestId, controller, done: new Promise(resolve => { done = resolve; }), timedOut: false };
    this.active = active;
    const timeout = setTimeout(() => { active.timedOut = true; controller.abort(); }, this.timeout);
    const emit = event => this.emit({ ...event, requestId: request.requestId });
    emit({ type: 'started', provider, model: request.model });
    try {
      const result = await this.providers[provider].run(request, this.storage.getSession(provider), { signal: controller.signal, emit });
      if (controller.signal.aborted) throw new ProviderError('Request cancelled.', 'CANCELLED');
      if (!result.text?.trim()) throw new ProviderError('The provider returned an empty answer.');
      const saved = this.storage.archive({
        input: request.text, instructions: request.instructions, screenshot: request.screenshot,
        response: result.text, provider, model: result.actualModel || request.model, selectedModel: request.model,
        sessionId: result.sessionId, turnId: result.turnId, messageId: result.messageId, usage: result.usage,
      });
      this.storage.setSession(provider, { sessionId: result.sessionId });
      return { ok: true, text: result.text, provider, model: saved.model, entryId: saved.id };
    } catch (error) {
      // A failed native turn may already be in its transcript. Do not silently reuse partial context.
      this.storage.setSession(provider, null);
      return { ok: false, code: active.timedOut ? 'TIMEOUT' : (error.code || 'PROVIDER_ERROR'),
        error: active.timedOut ? 'The request timed out. Start a new request when ready.' : error.message };
    } finally {
      clearTimeout(timeout); this.active = null; done();
    }
  }
  model(provider) { return { openai: ASTRA, claude: OPUS, grok: GROK }[provider]; }
  async compare(request, settings) {
    let done;
    const active = { id: request.requestId, controllers: new Map(), done: new Promise(resolve => { done = resolve; }) };
    this.active = active;
    try {
      // Start every adapter before awaiting any result; each resumes its own comparison conversation.
      const results = await Promise.all(PROVIDERS.map(async provider => {
        const model = this.model(provider);
        const controller = new AbortController();
        active.controllers.set(provider, controller);
        let timedOut = false;
        const timer = setTimeout(() => { timedOut = true; controller.abort(); }, this.timeout);
        const emit = event => this.emit({ ...event, provider, requestId: request.requestId });
        emit({ type: 'started', model, comparison: true });
        let answer;
        try {
          const result = await this.providers[provider].run({ ...request, provider, model, effort: settings.effort },
            this.storage.getSession(provider, 'compare'), { signal: controller.signal, emit });
          if (controller.signal.aborted) throw new ProviderError('Request cancelled.', 'CANCELLED');
          if (!result.text?.trim()) throw new ProviderError('The provider returned an empty answer.');
          if (typeof result.sessionId !== 'string' || !result.sessionId) {
            throw new ProviderError('The provider did not return a conversation ID.', 'SESSION_ERROR');
          }
          this.storage.setSession(provider, { sessionId: result.sessionId }, 'compare');
          answer = { ...result, ok: true, provider, model: result.actualModel || model, selectedModel: model };
        } catch (error) {
          // A failed turn may have changed the native transcript. Reset only this model and tell the UI.
          this.storage.setSession(provider, null, 'compare');
          answer = { ok: false, provider, model, contextReset: true, code: timedOut ? 'TIMEOUT' : (error.code || 'PROVIDER_ERROR'),
            error: timedOut ? 'The request timed out.' : error.message };
        } finally { clearTimeout(timer); active.controllers.delete(provider); }
        emit({ type: 'finished', result: answer });
        return answer;
      }));
      const successful = results.filter(result => result.ok);
      const saved = successful.length ? this.storage.archive({
        input: request.text, instructions: request.instructions, screenshot: request.screenshot,
        provider: 'compare', model: 'Three-model comparison', results,
        response: results.map(result => `## ${result.model}\n\n${result.ok ? result.text : result.error}`).join('\n\n'),
      }) : null;
      return { ok: successful.length > 0, comparison: true, results, entryId: saved?.id };
    } finally { this.active = null; done(); }
  }
  cancel(requestId, provider) {
    if (!this.active || (requestId && requestId !== this.active.id)) return false;
    if (this.active.controllers) {
      if (provider && !this.active.controllers.has(provider)) return false;
      for (const [name, controller] of this.active.controllers) if (!provider || provider === name) controller.abort();
      return true;
    }
    this.active.controller.abort(); return true;
  }
  async reset(provider) {
    if (this.restoring) await this.restoring;
    if (this.active) { this.cancel(); await this.active.done; }
    this.storage.resetSessions(provider);
  }
  async restore(id) {
    if (this.active || this.restoring) throw new ProviderError('Wait for the current request or conversation change to finish.', 'BUSY');
    const entry = this.storage.entry(id);
    if (!entry.sessionId || !this.providers[entry.provider]) throw new Error('This older response has no resumable subscription session. Start a new chat.');
    let done;
    this.restoring = new Promise(resolve => { done = resolve; });
    try {
      const session = await this.providers[entry.provider].fork(entry);
      this.storage.setSession(entry.provider, session);
      const settings = this.storage.getSettings();
      settings.mode = 'single';
      settings.provider = entry.provider;
      this.storage.setSettings(settings);
      return settings;
    } finally { this.restoring = null; done(); }
  }
  close() {
    this.cancel();
    for (const provider of Object.values(this.providers)) provider.close();
  }
}
module.exports = { RequestController };
