const { test, expect, _electron } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { redImage } = require('../fixtures/image.cjs');
let electronApp, page, directory;
test.beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'spectro-ui-'));
  electronApp = await _electron.launch({ args: [path.resolve(__dirname, '../..')], env: { ...process.env, SPECTRO_TEST_USER_DATA: directory, ELECTRON_RUN_AS_NODE: undefined } });
  page = await electronApp.firstWindow();
  await expect(page.locator('#astra-label')).toBeVisible();
  await page.getByRole('button', { name: 'OpenAI', exact: true }).click();
});
test.afterEach(async () => { await electronApp?.close(); await fs.rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });
test('real settings IPC keeps Claude on Opus and persists Astra; secure renderer', async () => {
  await page.getByRole('button', { name: 'Claude', exact: true }).click();
  await expect(page.locator('#claude-label')).toHaveText('Claude Opus');
  await expect(page.getByRole('button', { name: 'Sonnet', exact: true })).toHaveCount(0);
  const settings = await page.evaluate(() => window.electronAPI.getSettings());
  expect(settings).toMatchObject({ provider: 'claude', claudeModel: 'opus', openaiModel: 'gpt-6-astra' });
  expect(await page.evaluate(() => typeof window.require)).toBe('undefined');
  const newWindow = electronApp.waitForEvent('window');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const settingsPage = await newWindow;
  await settingsPage.locator('#provider').selectOption('openai');
  await expect(settingsPage.locator('#claude-model')).toHaveCount(0);
  await expect(settingsPage.getByRole('heading', { name: 'Anthropic · Claude Opus' })).toBeVisible();
  await settingsPage.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.locator('#astra-label')).toBeVisible();
  await page.reload();
  await expect(page.locator('#astra-label')).toBeVisible();
  expect((await page.evaluate(() => window.electronAPI.getSettings())).claudeModel).toBe('opus');
  await page.locator('#input-textarea').fill('Draft to reset');
  await page.locator('#input-textarea').press('Meta+r');
  await expect(page.locator('#input-textarea')).toHaveValue('');
  await expect(page.locator('#status-message')).toHaveText('New conversations started');
});
test('streaming locks duplicate submissions, preserves math, and sanitizes output', async () => {
  await electronApp.evaluate(({ ipcMain }) => {
    globalThis.testCalls = 0;
    ipcMain.removeHandler('call-ai');
    ipcMain.handle('call-ai', async (event, request) => {
      globalThis.testCalls++;
      event.sender.send('ai-event', { requestId: request.requestId, type: 'delta', text: 'Streaming' });
      await new Promise(resolve => setTimeout(resolve, 500));
      return { ok: true, text: '**Answer**\n\n\\(x^2\\)\n\n$$\\frac{1}{2}$$\n\n$$y=2$$ Preserved trailing text.\n\n<script>window.PWNED=1</script>', model: 'gpt-6-astra' };
    });
  });
  await page.locator('#input-textarea').fill('Test response');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Stop', exact: true })).toBeVisible();
  await page.locator('#input-textarea').fill('Typed while streaming');
  await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeDisabled();
  await page.locator('#input-textarea').press('Meta+Enter');
  await expect(page.locator('#response-textarea strong')).toHaveText('Answer');
  await expect(page.locator('mjx-container')).toHaveCount(3);
  await expect(page.locator('#response-textarea')).toContainText('Preserved trailing text.');
  expect(await page.evaluate(() => window.PWNED)).toBeUndefined();
  expect(await electronApp.evaluate(() => globalThis.testCalls)).toBe(1);
});
test('image preview, quota error, and history order', async () => {
  const image = redImage();
  await electronApp.evaluate(({ BrowserWindow, ipcMain }, fixture) => {
    BrowserWindow.getAllWindows()[0].webContents.send('screenshot-captured', fixture);
    ipcMain.removeHandler('call-ai');
    ipcMain.handle('call-ai', () => ({ ok: false, code: 'QUOTA_EXCEEDED', error: 'Monthly spend limit reached.' }));
    ipcMain.removeHandler('get-history');
    ipcMain.handle('get-history', () => [{ id: 'old' }, { id: 'new' }]);
    ipcMain.removeHandler('get-history-entry');
    ipcMain.handle('get-history-entry', (_event, id) => ({ id, response: id === 'new' ? 'Newest answer' : 'Oldest answer', format: 'markdown' }));
  }, image);
  await expect(page.locator('#screenshot-section')).toBeVisible();
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.locator('#status-message')).toHaveText('Monthly spend limit reached.');
  await page.reload();
  await page.locator('#history-prev').click();
  await expect(page.locator('#response-textarea')).toContainText('Newest answer');
  await page.locator('#history-prev').click();
  await expect(page.locator('#response-textarea')).toContainText('Oldest answer');
});
test('hide covers Settings and a pending capture cannot reopen the app', async () => {
  const newWindow = electronApp.waitForEvent('window');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const settings = await newWindow;
  await expect(settings.locator('#provider')).toBeVisible();
  expect(await electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().every(window => window.isContentProtected() && window.isHiddenInMissionControl()))).toBe(true);
  await electronApp.evaluate(({ desktopCapturer, screen, nativeImage }, image) => {
    globalThis.captureReached = false;
    desktopCapturer.getSources = async () => {
      globalThis.captureReached = true;
      await new Promise(resolve => { globalThis.releaseCapture = resolve; });
      return [{ display_id: String(screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).id), thumbnail: nativeImage.createFromDataURL(image) }];
    };
  }, redImage());
  await page.evaluate(() => { window.capturePending = window.electronAPI.capture(); });
  await expect.poll(() => electronApp.evaluate(() => globalThis.captureReached)).toBe(true);
  await page.evaluate(() => window.electronAPI.dismiss());
  // Wait for the one-way dismiss IPC before completing the pending capture.
  await electronApp.evaluate(() => new Promise(resolve => setTimeout(resolve, 100)));
  await electronApp.evaluate(() => globalThis.releaseCapture());
  await page.evaluate(() => window.capturePending);
  expect(await electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().every(window => !window.isVisible()))).toBe(true);
  await page.evaluate(() => window.electronAPI.openSettings());
  await expect.poll(() => electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().find(window => window.webContents.getURL().endsWith('/settings.html')).isVisible())).toBe(true);
  await page.evaluate(() => window.electronAPI.dismiss());
  await expect.poll(() => electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().every(window => !window.isVisible()))).toBe(true);
});

test('capture preserves another app focus on success and failure; explicit activation still focuses input', async () => {
  const newWindow = electronApp.waitForEvent('window');
  await page.evaluate(() => window.electronAPI.openSettings());
  const settings = await newWindow;
  await expect(settings.locator('#provider')).toBeVisible();
  const foreground = await _electron.launch({
    args: [path.resolve(__dirname, '../fixtures/focus-window.cjs')],
    env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined },
  });
  try {
    const foregroundPage = await foreground.firstWindow();
    await expect.poll(() => foregroundPage.evaluate(() => document.hasFocus())).toBe(true);
    for (const fail of [false, true]) {
      await electronApp.evaluate(({ desktopCapturer, screen, nativeImage }, { image, fail }) => {
        desktopCapturer.getSources = async () => {
          if (fail) throw new Error('Synthetic capture failure');
          return [{ display_id: String(screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).id), thumbnail: nativeImage.createFromDataURL(image) }];
        };
      }, { image: redImage(), fail });
      const result = await page.evaluate(() => window.electronAPI.capture().catch(error => ({ error: error.message })));
      if (fail) expect(result.error).toContain('Synthetic capture failure');
      else expect(result.ok).toBe(true);
      await expect(page.locator('#screenshot-section')).toBeVisible();
      expect(await electronApp.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().every(window => window.isVisible() && !window.isFocused()))).toBe(true);
      // Count transient focus loss too, including delayed renderer screenshot events.
      const focus = await foreground.evaluate(async ({ BrowserWindow }) => {
        await new Promise(resolve => setTimeout(resolve, 250));
        const window = BrowserWindow.getAllWindows()[0];
        return { native: window.isFocused(), nativeBlurs: globalThis.blurCount,
          page: await window.webContents.executeJavaScript('({ focused: document.hasFocus(), blurs: window.blurCount })') };
      });
      expect(focus).toEqual({ native: true, nativeBlurs: 0, page: { focused: true, blurs: 0 } });
    }
    await electronApp.evaluate(({ app }) => app.emit('activate'));
    await expect.poll(() => page.evaluate(() => document.hasFocus())).toBe(true);
    await expect(page.locator('#instructions-textarea')).toBeFocused();
    await expect.poll(() => foreground.evaluate(() => globalThis.blurCount)).toBeGreaterThan(0);
  } finally { await foreground.close(); }
});

test('three-model view streams independently, shows one failure and restores the saved comparison', async () => {
  await page.getByRole('button', { name: 'All three', exact: true }).click();
  await expect(page.locator('.answer-card')).toHaveCount(3);
  await electronApp.evaluate(({ ipcMain }) => {
    const results = [
      { provider: 'openai', model: 'gpt-6-astra', ok: true, text: '**Astra answer** \\(x^2\\)' },
      { provider: 'claude', model: 'opus', ok: false, code: 'QUOTA_EXCEEDED', error: 'Claude quota reached' },
      { provider: 'grok', model: 'grok-4.7', ok: true, text: '**Grok answer** $y=2$' },
    ];
    ipcMain.removeHandler('call-ai');
    ipcMain.handle('call-ai', async (event, request) => {
      globalThis.comparisonInput = request;
      event.sender.send('ai-event', { requestId: request.requestId, provider: 'openai', type: 'delta', text: 'First response' });
      event.sender.send('ai-event', { requestId: request.requestId, provider: 'claude', type: 'finished', result: results[1] });
      await new Promise(resolve => setTimeout(resolve, 700));
      event.sender.send('ai-event', { requestId: request.requestId, provider: 'grok', type: 'finished', result: results[2] });
      return { ok: true, comparison: true, results, entryId: 'round' };
    });
    ipcMain.removeHandler('get-history');
    ipcMain.handle('get-history', () => [{ id: 'round' }]);
    ipcMain.removeHandler('get-history-entry');
    ipcMain.handle('get-history-entry', () => ({ id: 'round', provider: 'compare', model: 'Three-model comparison', results, input: 'Compare image' }));
  });
  await page.locator('#image-file').setInputFiles({ name: 'red.png', mimeType: 'image/png', buffer: Buffer.from(redImage().split(',')[1], 'base64') });
  await page.locator('#input-textarea').fill('Compare image');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.locator('[data-provider="openai"].answer-card .response-area')).toHaveText('First response');
  await expect(page.locator('[data-provider="claude"].answer-card .card-status')).toHaveText('Claude quota reached');
  await expect(page.getByRole('button', { name: 'Stop Grok 4.7', exact: true })).toBeVisible();
  await expect(page.locator('#status-message')).toContainText('2/3 completed');
  await expect(page.locator('[data-provider="grok"].answer-card strong').last()).toHaveText('Grok answer');
  await expect(page.locator('[data-provider="openai"].answer-card mjx-container')).toHaveCount(1);
  await expect(page.locator('[data-provider="grok"].answer-card mjx-container')).toHaveCount(1);
  expect(await electronApp.evaluate(() => globalThis.comparisonInput.screenshot)).toBe(redImage());
  await page.locator('#history-prev').click();
  await expect(page.locator('[data-provider="openai"].answer-card .response-area strong')).toHaveText('Astra answer');
  await expect(page.locator('#resume-history')).toBeDisabled();
  await expect(page.locator('#comparison-note')).toContainText('does not prove correctness');
});
