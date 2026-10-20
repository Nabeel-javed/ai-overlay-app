'use strict';
const { validateRequest, ASTRA } = require('./models');
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
    const provider = settings.provider;
    request = { ...request, provider, model: provider === 'openai' ? ASTRA : settings.claudeModel, effort: settings.effort };
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
  cancel(requestId) {
    if (!this.active || (requestId && requestId !== this.active.id)) return false;
    this.active.controller.abort(); return true;
  }
  async reset(provider) {
    if (this.restoring) await this.restoring;
    if (this.active) { this.cancel(); await this.active.done; }
    provider ? this.storage.setSession(provider, null) : this.storage.resetSessions();
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
      settings.provider = entry.provider;
      if (entry.provider === 'claude') settings.claudeModel = entry.selectedModel === 'opus' || /opus/.test(entry.model) ? 'opus' : 'sonnet';
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
