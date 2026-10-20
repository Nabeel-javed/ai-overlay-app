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
});
test.afterEach(async () => { await electronApp?.close(); await fs.rm(directory, { recursive: true, force: true }); });
test('real settings IPC switches Sonnet/Opus and persists Astra; secure renderer', async () => {
  await page.getByRole('button', { name: 'Claude', exact: true }).click();
  await expect(page.locator('#claude-models')).toBeVisible();
  await page.getByRole('button', { name: 'Opus', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Opus', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const settings = await page.evaluate(() => window.electronAPI.getSettings());
  expect(settings).toMatchObject({ provider: 'claude', claudeModel: 'opus', openaiModel: 'gpt-6-astra' });
  expect(await page.evaluate(() => typeof window.require)).toBe('undefined');
  const newWindow = electronApp.waitForEvent('window');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const settingsPage = await newWindow;
  await settingsPage.locator('#provider').selectOption('openai');
  await settingsPage.locator('#claude-model').selectOption('sonnet');
  await settingsPage.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.locator('#astra-label')).toBeVisible();
  await page.reload();
  await expect(page.locator('#astra-label')).toBeVisible();
  expect((await page.evaluate(() => window.electronAPI.getSettings())).claudeModel).toBe('sonnet');
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
