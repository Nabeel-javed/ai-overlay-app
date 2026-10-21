// Explicit, opt-in integration checks. Uses subscription quota and synthetic content only.
const { CodexProvider } = require('../src/providers/codex');
const { GrokProvider } = require('../src/providers/grok');
const { ClaudeProvider } = require('../src/providers/claude');
const { redImage } = require('../test/fixtures/image.cjs');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
async function main() {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'spectro-live-'));
  const reports = [];
  let codex = new CodexProvider(path.join(cwd, 'codex'));
  let grok = new GrokProvider(path.join(cwd, 'grok'));
  const claude = new ClaudeProvider(path.join(cwd, 'claude'));
  async function run(name, provider, model, session, text, screenshot = null, cancel = false) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 90000);
    const start = Date.now();
    let firstToken;
    try {
      const result = await provider.run({ requestId: name, model, effort: 'low', text, instructions: '', screenshot }, session, {
        signal: controller.signal, emit: event => {
          if (event.type === 'delta') { firstToken ??= Date.now() - start; if (cancel) controller.abort(); }
        },
      });
      reports.push({ name, status: 'passed', model: result.actualModel, elapsedMs: Date.now() - start, firstTokenMs: firstToken, text: result.text });
      return result;
    } catch (error) {
      reports.push({ name, status: error.code === 'CANCELLED' && cancel ? 'passed' : error.code === 'QUOTA_EXCEEDED' ? 'blocked' : 'failed', code: error.code, error: error.message, elapsedMs: Date.now() - start });
      if (error.code === 'QUOTA_EXCEEDED' || (error.code === 'CANCELLED' && cancel)) return null;
      throw error;
    } finally { clearTimeout(timer); }
  }
  try {
    if (!process.argv.includes('--claude-only') && !process.argv.includes('--grok-only')) {
    const first = await run('astra-image', codex, 'gpt-6-astra', null, 'Remember the code ORBIT_29. What is the dominant color of this image? Reply with the color only.', redImage());
    assert.match(first.text, /red/i);
    assert.equal(first.actualModel, 'gpt-6-astra');
    codex.close();
    codex = new CodexProvider(path.join(cwd, 'codex'));
    const followup = await run('astra-resume', codex, 'gpt-6-astra', { sessionId: first.sessionId }, 'What code did I ask you to remember, and what color was the image?');
    assert.match(followup.text, /ORBIT_29/);
    assert.match(followup.text, /red/i);
    const fork = await codex.fork(first);
    const forked = await run('astra-history-fork', codex, 'gpt-6-astra', fork, 'What code did I ask you to remember? Reply with the code only.');
    assert.match(forked.text, /ORBIT_29/);
    await run('astra-cancel', codex, 'gpt-6-astra', null, 'Write 100 numbered sentences about geometry.', null, true);
    }
    if (!process.argv.includes('--grok-only')) for (const model of ['sonnet', 'opus']) {
      const result = await run(`claude-${model}-image`, claude, model, null, 'What is the dominant color of this image? Reply with the color only.', redImage());
      if (result) assert.match(result.text, /red/i);
    }
    if (!process.argv.includes('--claude-only')) {
      const first = await run('grok-image', grok, 'grok-4.7', null, 'Remember SPECTRO_47. What color is this image? Reply with the color only.', redImage());
      assert.match(first.text, /red/i);
      assert.equal(first.actualModel, 'grok-4.7');
      grok.close(); grok = new GrokProvider(path.join(cwd, 'grok'));
      const followup = await run('grok-resume', grok, 'grok-4.7', { sessionId: first.sessionId }, 'What code did I ask you to remember? Reply with the code only.');
      assert.match(followup.text, /SPECTRO_47/);
      await run('grok-cancel', grok, 'grok-4.7', null, 'Write 100 numbered sentences about geometry.', null, true);
    }
  } finally {
    codex.close(); claude.close(); grok.close();
    await fs.mkdir('.artifacts', { recursive: true });
    await fs.writeFile(process.argv.includes('--claude-only') ? '.artifacts/live-claude-check.json' : process.argv.includes('--grok-only') ? '.artifacts/live-grok-check.json' : '.artifacts/live-check.json', JSON.stringify({ checkedAt: new Date().toISOString(), reports }, null, 2));
    console.log(JSON.stringify(reports, null, 2));
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
