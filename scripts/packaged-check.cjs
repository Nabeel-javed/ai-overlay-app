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
    await app.evaluate(({ BrowserWindow }, image) => BrowserWindow.getAllWindows()[0].webContents.send('screenshot-captured', image), redImage());
    await page.locator('#input-textarea').fill('What color is the attached square? Give the color in bold, then the equation 2+2=4 as inline LaTeX. One sentence.');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(page.locator('#status-message')).toContainText('Saved', { timeout: 90000 });
    await expect(page.locator('#response-textarea')).toContainText(/red/i);
    await expect(page.locator('#response-model')).toHaveText('gpt-6-astra');
    await expect(page.locator('mjx-container')).toHaveCount(1);
    report.astra = 'passed: image, IPC, stream, archive, Markdown and LaTeX';
    await fs.mkdir('.artifacts', { recursive: true });
    await page.screenshot({ path: '.artifacts/packaged-astra.png' });
    await page.getByRole('button', { name: 'Claude', exact: true }).click();
    const result = await page.evaluate(() => window.electronAPI.submit({
      requestId: crypto.randomUUID(), text: 'Reply with OK.', instructions: '', screenshot: null,
    }));
    if (result.ok) report.claude = { status: 'passed', model: result.model };
    else if (result.code === 'QUOTA_EXCEEDED') report.claude = { status: 'blocked', code: result.code, message: result.error };
    else throw new Error(`Packaged Claude failed: ${result.code}: ${result.error}`);
    const settingsWindow = app.waitForEvent('window');
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    const settings = await settingsWindow;
    await expect(settings.locator('#openai-status')).toContainText('Connected', { timeout: 20000 });
    await expect(settings.locator('#claude-status')).toContainText('Connected', { timeout: 20000 });
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
    await fs.rm(directory, { recursive: true, force: true });
    await fs.mkdir('.artifacts', { recursive: true });
    await fs.writeFile('.artifacts/packaged-check.json', JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
