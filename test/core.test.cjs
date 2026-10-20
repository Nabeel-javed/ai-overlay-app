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
  return new AppStorage(new MemoryStore(migrateLegacyData(legacy)), directory, crypto.randomBytes(32));
}
const payload = { requestId: 'test-1', text: 'A question', instructions: '', screenshot: null };
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }

test('migration pins Astra, preserves Claude selection and history, excludes credentials', () => {
  const migrated = migrateLegacyData({ apiProvider: 'claude', claudeUseOpus: true, openaiModel: 'o4-mini', openaiApiKey: 'private', responseHistory: [{ id: 123, response: 'existing answer' }] });
  assert.equal(migrated.settings.openaiModel, ASTRA);
  assert.equal(migrated.settings.claudeModel, 'opus');
  assert.equal(migrated.responseHistory[0].response, 'existing answer');
  assert.equal(migrated.openaiApiKey, undefined);
  assert.equal(normalizeSettings({ apiProvider: 'removed' }).provider, 'openai');
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
  assert.equal(classifyClaudeMessage({ ...message, modelUsage: { 'claude-sonnet-5-5': {} } }), null);
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
  provider.options = async model => ({ model });
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
