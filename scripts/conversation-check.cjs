// Opt-in: verify all three native conversations survive a complete app restart.
// Sends only synthetic text and a generated image; uses subscription quota.
const { _electron } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { redImage } = require('../test/fixtures/image.cjs');

function answers(round) {
  const failed = (round.results || []).filter(result => !result.ok);
  if (!round.ok || failed.length) {
    const error = new Error(failed.map(result => `${result.provider}: ${result.code}: ${result.error}`).join('\n') || round.error || 'Comparison failed.');
    error.blocked = failed.length > 0 && failed.every(result => ['QUOTA_EXCEEDED', 'AUTH_REQUIRED'].includes(result.code));
    throw error;
  }
  assert.equal(round.results.length, 3);
  return Object.fromEntries(round.results.map(result => {
    const text = result.text.trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
    return [result.provider, { sessionId: result.sessionId, model: result.model, answer: JSON.parse(text) }];
  }));
}

async function main() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'spectro-conversation-'));
  const report = { checkedAt: new Date().toISOString(), packaged: process.argv.includes('--packaged'), status: 'failed' };
  const code = `SPECTRO_${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
  let app;
  async function launch() {
    app = await _electron.launch({
      ...(report.packaged ? { executablePath: path.resolve('dist/mac-arm64/Spectro.app/Contents/MacOS/Spectro') } : { args: [path.resolve(__dirname, '..')] }),
      env: { ...process.env, SPECTRO_TEST_USER_DATA: directory, ELECTRON_RUN_AS_NODE: undefined },
    });
    assert.equal(await app.evaluate(({ app }) => app.getPath('userData')), directory);
    return app.firstWindow();
  }
  async function submit(page, text, screenshot = null) {
    return page.evaluate(payload => window.electronAPI.submit(payload), {
      requestId: crypto.randomUUID(), text, screenshot, instructions: '',
    });
  }
  try {
    let page = await launch();
    assert.equal((await page.evaluate(() => window.electronAPI.getSettings())).mode, 'compare');
    console.log('Sending a synthetic code and image to all three models.');
    report.first = answers(await submit(page,
      `Remember the code ${code} and the color of the attached image. Choose any six-digit number as your marker for this conversation. Reply only with a JSON object containing exactly three string fields: "code", "color" (lowercase English), and "marker" (six digits).`, redImage()));
    for (const value of Object.values(report.first)) {
      assert.equal(value.answer.code, code);
      assert.equal(value.answer.color, 'red');
      assert.match(value.answer.marker, /^\d{6}$/);
      assert.ok(value.sessionId);
    }
    await app.close(); app = null;
    page = await launch();
    console.log('App restarted. Asking each model to recall its previous answer without resending the code or image.');
    report.followup = answers(await submit(page,
      'Return the exact same JSON object you produced in your previous answer, with the same code, color, and marker. Do not choose a new marker. Output only JSON.'));
    for (const provider of ['openai', 'claude', 'grok']) {
      assert.equal(report.followup[provider].sessionId, report.first[provider].sessionId, `${provider} resumed its existing session`);
      assert.deepEqual(report.followup[provider].answer, report.first[provider].answer, `${provider} recalled the earlier prompt, image and its own answer`);
    }
    report.status = 'passed';
  } catch (error) {
    report.status = error.blocked ? 'blocked' : 'failed';
    report.error = error.message;
    process.exitCode = 1;
  } finally {
    await app?.close();
    await fs.rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    await fs.mkdir('.artifacts', { recursive: true });
    await fs.writeFile('.artifacts/conversation-check.json', JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
