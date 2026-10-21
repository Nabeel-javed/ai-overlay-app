const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { GrokProvider } = require('../src/providers/grok');
const runtime = { binary: process.execPath, cwd: __dirname, env: process.env };
const fixture = path.join(__dirname, 'fixtures/grok-stream.cjs');
test('Grok preserves UTF-8 split across chunks and a terminal line without newline', async () => {
  const events = [];
  const provider = new GrokProvider('/unused');
  const result = await provider.stream(runtime, [fixture, 'success'], new AbortController().signal, event => events.push(event));
  assert.equal(result.text, 'Café 🔴');
  assert.equal(result.actualModel, 'grok-4.7');
  assert.equal(events.filter(event => event.type === 'delta').map(event => event.text).join(''), 'Café 🔴');
  provider.close();
});
for (const scenario of ['api', 'tools', 'missing', 'truncated']) {
  test(`Grok rejects ${scenario} responses`, async () => {
    const events = [];
    const provider = new GrokProvider('/unused');
    await assert.rejects(provider.stream(runtime, [fixture, scenario], new AbortController().signal, event => events.push(event)), {
      code: ['api', 'tools'].includes(scenario) ? 'CONFIG_ERROR' : scenario === 'truncated' ? 'INCOMPLETE_RESPONSE' : 'CLIENT_EXIT',
    });
    if (['api', 'tools'].includes(scenario)) assert.equal(events.length, 0);
    provider.close();
  });
}
