const { test, expect, _electron } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { redImage } = require('../fixtures/image.cjs');
let electronApp, page, directory;
const fire = key => electronApp.evaluate((_, accelerator) => globalThis.shortcutActions.get(accelerator)(), key);

test.beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'spectro-shortcuts-'));
  electronApp = await _electron.launch({
    args: [path.resolve(__dirname, '../fixtures/shortcuts-app.cjs')],
    env: { ...process.env, SPECTRO_TEST_USER_DATA: directory, ELECTRON_RUN_AS_NODE: undefined },
  });
  page = await electronApp.firstWindow();
  await expect(page.locator('#compare-mode')).toHaveAttribute('aria-pressed', 'true');
  await electronApp.evaluate(({ desktopCapturer, screen, nativeImage }, image) => {
    desktopCapturer.getSources = async () => [{ display_id: String(screen.getPrimaryDisplay().id), thumbnail: nativeImage.createFromDataURL(image) }];
  }, redImage());
});
test.afterEach(async () => {
  await electronApp?.close();
  await fs.rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

test('shortcut cycle includes All three and direct selection uses 0 through 3', async () => {
  for (const selection of ['openai', 'claude', 'grok', 'compare', 'openai']) {
    await fire('CommandOrControl+Shift+P');
    await expect(page.locator(`.provider-btn[data-provider="${selection}"]`)).toHaveAttribute('aria-pressed', 'true');
  }
  for (const [number, selection] of [[0, 'compare'], [3, 'grok'], [2, 'claude'], [1, 'openai']]) {
    await fire(`CommandOrControl+${number}`);
    await expect(page.locator(`.provider-btn[data-provider="${selection}"]`)).toHaveAttribute('aria-pressed', 'true');
  }
  expect(await electronApp.evaluate(() => [4, 5].some(number => globalThis.shortcutActions.has(`CommandOrControl+${number}`)))).toBe(false);
});

test('refresh removes captured image, question and answers while follow-ups keep all three sessions', async () => {
  const initialSize = await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getSize());
  await page.locator('#input-textarea').fill('Remember this question');
  await page.evaluate(() => window.electronAPI.capture());
  await expect(page.locator('#screenshot-section')).toBeVisible();
  await page.locator('#instructions-textarea').fill('Remember the image');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.locator('#status-message')).toContainText('3/3 completed');
  await page.evaluate(() => { window.refreshMarker = 'must survive'; });
  await fire('CommandOrControl+Shift+R');
  await expect(page.locator('#status-message')).toHaveText('Screen cleared · conversations kept');
  await expect(page.locator('#input-textarea')).toHaveValue('');
  await expect(page.locator('#instructions-textarea')).toHaveValue('');
  await expect(page.locator('#screenshot-section')).toBeHidden();
  await expect(page.locator('#screenshot-img')).not.toHaveAttribute('src');
  await expect(page.locator('.answer-card .response-area')).toHaveText(['', '', '']);
  expect(await page.evaluate(() => window.refreshMarker)).toBe('must survive');
  expect(await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getSize())).toEqual(initialSize);
  await page.locator('#input-textarea').fill('Follow-up question');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.locator('#status-message')).toContainText('3/3 completed');
  const followups = await electronApp.evaluate(() => globalThis.requestInputs.slice(-3));
  for (const { provider, request, session } of followups) {
    expect(session.sessionId).toBe(`thread-${provider}`);
    expect(request.screenshot).toBeNull();
    expect(request.instructions).toBe('');
  }
});

test('refresh discards an in-flight screenshot and leaves an active response intact', async () => {
  await electronApp.evaluate(({ desktopCapturer }) => {
    const capture = desktopCapturer.getSources;
    desktopCapturer.getSources = async () => {
      await new Promise(resolve => { globalThis.releaseCapture = resolve; });
      return capture();
    };
  });
  await page.evaluate(() => { window.pendingCapture = window.electronAPI.capture(); });
  await expect.poll(() => electronApp.evaluate(() => typeof globalThis.releaseCapture)).toBe('function');
  await fire('CommandOrControl+Shift+R');
  await expect(page.locator('#status-message')).toHaveText('Screen cleared · conversations kept');
  await electronApp.evaluate(() => globalThis.releaseCapture());
  expect(await page.evaluate(() => window.pendingCapture)).toMatchObject({ cancelled: true });
  await expect(page.locator('#screenshot-section')).toBeHidden();
  await electronApp.evaluate(() => {
    globalThis.responseGate = new Promise(resolve => { globalThis.releaseResponse = resolve; });
  });
  await page.locator('#input-textarea').fill('Still generating');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect.poll(() => electronApp.evaluate(() => globalThis.requestInputs.length)).toBe(3);
  await fire('CommandOrControl+Shift+R');
  await expect(page.locator('#notification')).toHaveText('Wait for the response or stop it before refreshing.');
  await expect(page.locator('#input-textarea')).toHaveValue('Still generating');
  await electronApp.evaluate(() => globalThis.releaseResponse());
  await expect(page.locator('#status-message')).toContainText('3/3 completed');
});
