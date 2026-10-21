const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { normalizeSettings, validateRequest, ASTRA } = require('../src/models');
const { AppStorage, migrateLegacyData } = require('../src/storage');
const { RequestController } = require('../src/requests');
const { classifyClaudeMessage, ClaudeProvider } = require('../src/providers/claude');
const { cleanEnvironment, checkVersion } = require('../src/providers/runtime');

class MemoryStore {
  constructor(value = {}) { this.value = value; }
  get(key, fallback) { return this.value[key] ?? fallback; }
  set(key, value) { this.value[key] = value; }
}
function fixture(t, legacy) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'spectro-unit-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return new AppStorage(new MemoryStore(migrateLegacyData({ mode: 'single', ...legacy })), directory, crypto.randomBytes(32));
}
const payload = { requestId: 'test-1', text: 'A question', instructions: '', screenshot: null };
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }

test('migration pins Astra and Opus, preserves history, excludes credentials', () => {
  const migrated = migrateLegacyData({ apiProvider: 'claude', claudeUseOpus: true, openaiModel: 'o4-mini', openaiApiKey: 'private', responseHistory: [{ id: 123, response: 'existing answer' }] });
  assert.equal(migrated.settings.openaiModel, ASTRA);
  assert.equal(migrated.settings.claudeModel, 'opus');
  assert.equal(migrated.responseHistory[0].response, 'existing answer');
  assert.equal(migrated.openaiApiKey, undefined);
  assert.equal(normalizeSettings({ apiProvider: 'removed' }).provider, 'openai');
  for (const old of [{}, { claudeUseOpus: false }, { claudeModel: 'sonnet' }]) {
    assert.equal(normalizeSettings(old).claudeModel, 'opus');
  }
});
test('request validation rejects untrusted image URLs and oversized inputs', () => {
  assert.throws(() => validateRequest({ ...payload, screenshot: 'file:///etc/passwd' }));
  assert.throws(() => validateRequest({ ...payload, text: 'a'.repeat(100001) }));
  assert.throws(() => validateRequest({ ...payload, requestId: '../bad' }));
  assert.equal(validateRequest(payload).text, 'A question');
});
test('a provider switch during a request cannot corrupt the answer metadata', async t => {
  const storage = fixture(t);
  const result = deferred();
  const events = [];
  const providers = { openai: { run: async () => result.promise } };
  const controller = new RequestController(storage, providers, event => events.push(event));
  const pending = controller.submit(payload);
  assert.equal((await controller.submit({ ...payload, requestId: 'duplicate' })).code, 'BUSY');
  storage.setSettings({ ...storage.getSettings(), provider: 'claude', claudeModel: 'opus' });
  result.resolve({ text: 'Astra answered', actualModel: ASTRA, sessionId: 'thread-1', turnId: 'turn-1' });
  assert.equal((await pending).ok, true);
  assert.equal(storage.history()[0].provider, 'openai');
  assert.equal(storage.history()[0].model, ASTRA);
  assert.equal(storage.getSession('openai').sessionId, 'thread-1');
  assert.equal(events[0].requestId, payload.requestId);
});
test('cancel clears partial context and does not archive a completed answer', async t => {
  const storage = fixture(t);
  storage.setSession('openai', { sessionId: 'old' });
  const provider = { run: (_request, _session, { signal }) => new Promise((_, reject) =>
    signal.addEventListener('abort', () => reject(Object.assign(new Error('Cancelled'), { code: 'CANCELLED' })), { once: true })) };
  const controller = new RequestController(storage, { openai: provider }, () => {});
  const pending = controller.submit(payload);
  assert.equal(controller.cancel('wrong-id'), false);
  assert.equal(controller.cancel(payload.requestId), true);
  assert.equal((await pending).code, 'CANCELLED');
  assert.equal(storage.history().length, 0);
  assert.equal(storage.getSession('openai'), null);
});
test('timeout becomes an actionable error', async t => {
  const storage = fixture(t);
  const provider = { run: (_request, _session, { signal }) => new Promise((_, reject) =>
    signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })) };
  const result = await new RequestController(storage, { openai: provider }, () => {}, 15).submit(payload);
  assert.equal(result.code, 'TIMEOUT');
});
test('restoring history excludes new requests and reset waits for the fork', async t => {
  const storage = fixture(t);
  const entry = storage.archive({ provider: 'openai', model: ASTRA, response: 'old', sessionId: 'old', turnId: 'first' });
  const fork = deferred();
  const controller = new RequestController(storage, { openai: { fork: () => fork.promise } }, () => {});
  const restoring = controller.restore(entry.id);
  assert.equal((await controller.submit(payload)).code, 'BUSY');
  await assert.rejects(controller.restore(entry.id), { code: 'BUSY' });
  const resetting = controller.reset();
  fork.resolve({ sessionId: 'fork' });
  await restoring;
  await resetting;
  assert.equal(storage.getSession('openai'), null);
});
test('an old Sonnet conversation continues with Opus and retains its original history label', async t => {
  const storage = fixture(t);
  storage.store.set('settings', { ...storage.getSettings(), claudeModel: 'sonnet' });
  const entry = storage.archive({ provider: 'claude', model: 'claude-sonnet-5-5', selectedModel: 'sonnet', response: 'old', sessionId: 'old', messageId: 'first' });
  const controller = new RequestController(storage, { claude: {
    fork: async () => ({ sessionId: 'fork' }),
    run: async (request, session) => {
      assert.equal(request.model, 'opus');
      assert.equal(session.sessionId, 'fork');
      return { text: 'Opus follow-up', actualModel: 'claude-opus-5-5', sessionId: 'fork' };
    },
  } }, () => {});
  assert.equal((await controller.restore(entry.id)).claudeModel, 'opus');
  assert.equal((await controller.submit(payload)).ok, true);
  assert.equal(storage.entry(entry.id).model, 'claude-sonnet-5-5');
  assert.throws(() => storage.setSettings({ ...storage.getSettings(), claudeModel: 'sonnet' }));
});
test('attachments are encrypted, authenticated, deduplicated, and pruned', t => {
  const storage = fixture(t);
  const screenshot = 'data:image/png;base64,aGVsbG8=';
  const first = storage.archive({ response: 'one', screenshot });
  storage.archive({ response: 'two', screenshot });
  assert.equal(fs.readdirSync(storage.directory).length, 1);
  assert.equal(storage.entry(first.id).screenshot, screenshot);
  const file = path.join(storage.directory, first.attachment);
  const bytes = fs.readFileSync(file);
  assert.equal(bytes.includes(Buffer.from('data:image')), false);
  bytes[bytes.length - 1] ^= 1;
  fs.writeFileSync(file, bytes);
  assert.throws(() => storage.entry(first.id));
  storage.clearHistory();
  assert.equal(fs.readdirSync(storage.directory).length, 0);
});
test('history keeps the newest 50 in chronological order', t => {
  const storage = fixture(t);
  for (let n = 0; n < 55; n++) storage.archive({ response: String(n) });
  assert.equal(storage.history().length, 50);
  assert.equal(storage.history()[0].response, '5');
  assert.equal(storage.history().at(-1).response, '54');
});
test('Claude synthetic success containing a spend limit is an error', () => {
  const message = { type: 'result', subtype: 'success', result: "You've hit your monthly spend limit", modelUsage: {} };
  assert.equal(classifyClaudeMessage(message).code, 'QUOTA_EXCEEDED');
  assert.equal(classifyClaudeMessage({ ...message, is_error: true }).code, 'QUOTA_EXCEEDED');
  assert.equal(classifyClaudeMessage({ ...message, modelUsage: { 'claude-opus-5-5': {} } }), null);
  assert.equal(classifyClaudeMessage({ type: 'assistant', error: 'rate_limit', message: { content: [{ type: 'text', text: 'Limit reached' }] } }).code, 'QUOTA_EXCEEDED');
});
test('Claude adapter sends image blocks, keeps session IDs and streams only text', async () => {
  let sent;
  const provider = new ClaudeProvider('/unused', ({ prompt, options }) => {
    assert.equal(options.model, 'opus');
    return {
      async *[Symbol.asyncIterator]() {
        for await (const message of prompt) sent = message;
        yield { type: 'system', subtype: 'init', model: 'claude-opus-5-5', tools: [], mcp_servers: [] };
        yield { type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Red' } } };
        yield { type: 'assistant', uuid: 'message-1', message: { model: 'claude-opus-5-5' } };
        yield { type: 'result', subtype: 'success', result: 'Red', session_id: 'session-1', modelUsage: { 'claude-opus-5-5': {} } };
      },
      close() {},
    };
  });
  provider.status = async () => ({ authenticated: true });
  provider.runtime = async () => ({ binary: '/unused/claude' });
  const events = [];
  const result = await provider.run({ ...payload, model: 'opus', screenshot: 'data:image/png;base64,aGVsbG8=' }, null, { signal: new AbortController().signal, emit: event => events.push(event) });
  assert.equal(sent.message.content[1].source.media_type, 'image/png');
  assert.equal(result.actualModel, 'claude-opus-5-5');
  assert.equal(result.messageId, 'message-1');
  assert.deepEqual(events.filter(event => event.type === 'delta'), [{ type: 'delta', text: 'Red' }]);
});
test('provider child environments exclude credentials, routing and nested-agent settings', () => {
  const original = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'must-not-inherit';
  try { assert.equal(cleanEnvironment().OPENAI_API_KEY, undefined); assert.equal(cleanEnvironment().CLAUDE_CONFIG_DIR, undefined); }
  finally { if (original === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = original; }
  assert.equal(checkVersion('codex-cli 0.163.0', '0.163.0', 'Codex'), '0.163.0');
  assert.throws(() => checkVersion('0.162.0', '0.163.0', 'Codex'));
});

test('comparison dispatches identical image requests concurrently and saves independent failures', async t => {
  const storage = fixture(t, { mode: 'compare', claudeUseOpus: true });
  const gates = Object.fromEntries(['openai', 'claude', 'grok'].map(provider => [provider, deferred()]));
  const started = [], events = [];
  const providers = Object.fromEntries(Object.keys(gates).map(provider => [provider, {
    run: async (request, session, { emit }) => {
      started.push({ request, session }); emit({ type: 'delta', text: provider });
      await gates[provider].promise;
      if (provider === 'claude') throw Object.assign(new Error('Quota reached'), { code: 'QUOTA_EXCEEDED' });
      return { text: `${provider} answer`, actualModel: request.model, sessionId: provider };
    },
  }]));
  storage.setSession('openai', { sessionId: 'unrelated conversation' });
  storage.setSession('claude', { sessionId: 'previous Claude comparison' }, 'compare');
  const controller = new RequestController(storage, providers, event => events.push(event));
  const image = 'data:image/png;base64,aGVsbG8=';
  const pending = controller.submit({ ...payload, screenshot: image });
  assert.equal(started.length, 3, 'All adapters start before any finishes');
  assert.ok(started.every(({ request }) => request.text === payload.text && request.screenshot === image));
  assert.deepEqual(started.map(({ session }) => session), [null, { sessionId: 'previous Claude comparison' }, null]);
  storage.setSettings({ ...storage.getSettings(), mode: 'single', effort: 'high' });
  assert.equal(started[1].request.model, 'opus');
  gates.grok.resolve(); await new Promise(setImmediate);
  assert.ok(events.some(event => event.provider === 'grok' && event.type === 'finished'));
  assert.ok(controller.active, 'Fast answer does not end the other requests');
  gates.claude.resolve(); gates.openai.resolve();
  const result = await pending;
  assert.equal(result.results.filter(answer => answer.ok).length, 2);
  assert.equal(result.results[1].code, 'QUOTA_EXCEEDED');
  assert.equal(result.results[1].contextReset, true);
  assert.equal(storage.history().length, 1);
  assert.equal(storage.entry(result.entryId).screenshot, image);
  assert.equal(storage.getSession('openai').sessionId, 'unrelated conversation');
  assert.deepEqual(storage.getSession('openai', 'compare'), { sessionId: 'openai' });
  assert.equal(storage.getSession('claude', 'compare'), null);
  assert.deepEqual(storage.getSession('grok', 'compare'), { sessionId: 'grok' });
});

test('comparison conversations persist independently across reloads and view switches until New chat', async t => {
  let storage = fixture(t, { mode: 'compare' });
  const names = ['openai', 'claude', 'grok'];
  const calls = [];
  for (const name of names) storage.setSession(name, { sessionId: `single-${name}` });
  const providers = Object.fromEntries(names.map(name => [name, {
    run: async (request, session) => {
      calls.push({ name, session });
      return { text: name, actualModel: request.model, sessionId: session?.sessionId || `compare-${name}` };
    },
  }]));
  let controller = new RequestController(storage, providers, () => {});
  assert.equal((await controller.submit(payload)).ok, true);
  assert.ok(calls.every(call => call.session === null));
  storage.setSettings({ ...storage.getSettings(), mode: 'single', provider: 'claude' });
  await controller.submit({ ...payload, requestId: 'single-turn' });
  assert.deepEqual(calls.at(-1).session, { sessionId: 'single-claude' });
  storage.setSettings({ ...storage.getSettings(), mode: 'compare' });
  // Recreate storage/controller from serialized state, with no in-memory controller state.
  storage = new AppStorage(new MemoryStore(JSON.parse(JSON.stringify(storage.store.value))), path.dirname(storage.directory), storage.key);
  controller = new RequestController(storage, providers, () => {});
  await controller.submit({ ...payload, requestId: 'follow-up', text: 'Explain your previous answer' });
  assert.deepEqual(calls.slice(-3).map(call => call.session), names.map(name => ({ sessionId: `compare-${name}` })));
  for (const name of names) assert.deepEqual(storage.getSession(name), { sessionId: `single-${name}` });
  await controller.reset();
  for (const name of names) {
    assert.equal(storage.getSession(name), null);
    assert.equal(storage.getSession(name, 'compare'), null);
  }
  await controller.submit({ ...payload, requestId: 'new-chat' });
  assert.ok(calls.slice(-3).every(call => call.session === null));
});

test('a comparison timeout clears only that model and the next round resumes successful models', async t => {
  const storage = fixture(t, { mode: 'compare' });
  const calls = [];
  let first = true;
  const providers = Object.fromEntries(['openai', 'claude', 'grok'].map(name => [name, {
    run: async (request, session, { signal }) => {
      calls.push({ name, session });
      if (first && name === 'claude') return new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
      return { text: name, sessionId: session?.sessionId || name, actualModel: request.model };
    },
  }]));
  const controller = new RequestController(storage, providers, () => {}, 15);
  const result = await controller.submit(payload);
  assert.equal(result.results[1].code, 'TIMEOUT');
  assert.equal(result.results[1].contextReset, true);
  first = false;
  await controller.submit({ ...payload, requestId: 'retry' });
  assert.deepEqual(calls.slice(-3).map(call => call.session), [{ sessionId: 'openai' }, null, { sessionId: 'grok' }]);
});

test('cancelling one comparison model leaves the others running; reset waits for all', async t => {
  const storage = fixture(t, { mode: 'compare' });
  for (const name of ['openai', 'claude', 'grok']) storage.setSession(name, { sessionId: name }, 'compare');
  const signals = {};
  const providers = Object.fromEntries(['openai', 'claude', 'grok'].map(provider => [provider, {
    run: (_request, _session, { signal }) => new Promise((_, reject) => {
      signals[provider] = signal;
      signal.addEventListener('abort', () => reject(Object.assign(new Error('Cancelled'), { code: 'CANCELLED' })), { once: true });
    }),
  }]));
  const controller = new RequestController(storage, providers, () => {});
  const pending = controller.submit(payload);
  assert.equal(controller.cancel(payload.requestId, 'grok'), true);
  assert.equal(signals.grok.aborted, true);
  assert.equal(signals.openai.aborted, false);
  await new Promise(setImmediate);
  assert.equal(storage.getSession('grok', 'compare'), null);
  assert.equal(storage.getSession('openai', 'compare').sessionId, 'openai');
  await controller.reset();
  assert.equal((await pending).results.every(answer => answer.code === 'CANCELLED'), true);
  assert.equal(storage.history().length, 0);
  assert.equal(controller.active, null);
  for (const name of ['openai', 'claude', 'grok']) assert.equal(storage.getSession(name, 'compare'), null);
});
