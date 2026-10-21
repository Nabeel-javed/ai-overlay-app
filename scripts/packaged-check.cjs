// Opt-in macOS package smoke test. Uses synthetic content and real subscription quota.
const { _electron, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { redImage } = require('../test/fixtures/image.cjs');

async function main() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'spectro-package-'));
  let app;
  const report = { checkedAt: new Date().toISOString() };
  try {
    app = await _electron.launch({
      executablePath: path.resolve('dist/mac-arm64/Spectro.app/Contents/MacOS/Spectro'),
      env: { ...process.env, SPECTRO_TEST_USER_DATA: directory, ELECTRON_RUN_AS_NODE: undefined },
    });
    const page = await app.firstWindow();
    await expect(page.locator('#astra-label')).toBeVisible();
    report.package = await app.evaluate(({ app, systemPreferences }) => ({
      packaged: app.isPackaged, version: app.getVersion(), userData: app.getPath('userData'),
      screenPermission: systemPreferences.getMediaAccessStatus('screen'),
    }));
    if (report.package.userData !== directory) throw new Error('Package did not use isolated test data.');
    report.connections = await page.evaluate(() => window.electronAPI.getConnections());
    await page.locator('#image-file').setInputFiles({ name: 'red.png', mimeType: 'image/png', buffer: Buffer.from(redImage().split(',')[1], 'base64') });
    await page.locator('#input-textarea').fill('What color is the attached square? Give the color in bold, then the equation 2+2=4 as inline LaTeX. One sentence.');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(page.locator('#status-message')).toContainText('3/3 completed', { timeout: 120000 });
    for (const provider of ['openai', 'claude', 'grok']) {
      await expect(page.locator(`.answer-card[data-provider="${provider}"] .response-area`)).toContainText(/red/i);
      await expect(page.locator(`.answer-card[data-provider="${provider}"] mjx-container`)).toHaveCount(1);
    }
    const history = await page.evaluate(() => window.electronAPI.getHistory());
    expect(history.at(-1).provider).toBe('compare');
    report.comparison = history.at(-1).results.map(result => ({ provider: result.provider, model: result.model, ok: result.ok, text: result.text }));
    expect(await page.locator('mjx-container').count()).toBeGreaterThan(0);
    await fs.mkdir('.artifacts', { recursive: true });
    await page.screenshot({ path: '.artifacts/packaged-comparison.png' });
    if (!process.argv.includes('--comparison-only')) {
    await page.getByRole('button', { name: 'Claude', exact: true }).click();
    await expect(page.locator('#claude-label')).toHaveText('Claude Opus');
    const result = await page.evaluate(image => window.electronAPI.submit({
      requestId: crypto.randomUUID(), text: 'What color is this square? Reply with the color only.', instructions: '', screenshot: image,
    }), redImage());
    if (result.ok) {
      expect(result.text).toMatch(/red/i);
      expect(result.model).toMatch(/opus/);
      report.opus = { status: 'passed', model: result.model };
    } else if (result.code === 'QUOTA_EXCEEDED') report.opus = { status: 'blocked', code: result.code, message: result.error };
    else throw new Error(`Packaged Opus failed: ${result.code}: ${result.error}`);
    }
    const settingsWindow = app.waitForEvent('window');
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    const settings = await settingsWindow;
    await expect(settings.locator('#openai-status')).toContainText('Connected', { timeout: 20000 });
    await expect(settings.locator('#claude-status')).toContainText('Connected', { timeout: 20000 });
    await expect(settings.locator('#grok-status')).toContainText('Connected', { timeout: 20000 });
    await settings.screenshot({ path: '.artifacts/packaged-settings.png', fullPage: true });
    if (process.argv.includes('--capture')) {
      // Local preview only, after all provider requests. Never archive, save or send this capture.
      await page.evaluate(() => window.electronAPI.capture());
      await expect(page.locator('#screenshot-img')).toHaveAttribute('src', /^data:image\/jpeg;base64,/);
      expect(await page.locator('#screenshot-img').evaluate(image => image.naturalWidth)).toBeGreaterThan(0);
      await page.locator('#remove-screenshot-button').click();
      report.capture = 'passed: native desktop capture and removal; image not sent or saved';
    }
  } finally {
    await app?.close();
    await fs.rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    await fs.mkdir('.artifacts', { recursive: true });
    await fs.writeFile('.artifacts/packaged-check.json', JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
