const { test, expect, _electron } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { redImage } = require('../fixtures/image.cjs');

test('imports an API-era encrypted store without changing the original or importing keys', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'spectro-migration-'));
  // Exact Conf 13 format used by electron-store 10: Buffer IV string as PBKDF2 salt.
  const iv = crypto.randomBytes(16);
  const password = crypto.pbkdf2Sync('spectro-encryption-key', iv.toString(), 10000, 32, 'sha512');
  const cipher = crypto.createCipheriv('aes-256-cbc', password, iv);
  const legacy = {
    apiProvider: 'claude', claudeUseOpus: true, openaiApiKey: 'TEST-KEY-NOT-A-SECRET',
    responseHistory: [{ id: 41, input: 'Old question', response: '<strong>Saved answer</strong><script>window.PWNED=1</script>', screenshot: redImage() }],
  };
  const original = Buffer.concat([iv, Buffer.from(':'), cipher.update(JSON.stringify(legacy)), cipher.final()]);
  await fs.writeFile(path.join(directory, 'config.json'), original);
  let app;
  const launch = () => _electron.launch({ args: [path.resolve(__dirname, '../..')], env: { ...process.env, SPECTRO_TEST_USER_DATA: directory, ELECTRON_RUN_AS_NODE: undefined } });
  try {
    app = await launch();
    let page = await app.firstWindow();
    await expect(page.locator('#history-indicator')).toHaveText('1 saved');
    expect(await page.evaluate(() => window.electronAPI.getSettings())).toMatchObject({ provider: 'claude', claudeModel: 'opus', openaiModel: 'gpt-6-astra' });
    await page.locator('#history-prev').click();
    await expect(page.locator('#response-textarea strong')).toHaveText('Saved answer');
    await expect(page.locator('#screenshot-section')).toBeVisible();
    expect(await page.evaluate(() => window.PWNED)).toBeUndefined();
    await expect(page.locator('#resume-history')).toBeDisabled();
    const data = await app.evaluate(({ app, safeStorage }, directory) => {
      const fs = process.getBuiltinModule('fs');
      const require = process.getBuiltinModule('module').createRequire(`${app.getAppPath()}/package.json`);
      const key = Buffer.from(safeStorage.decryptString(fs.readFileSync(`${directory}/spectro-storage-key`)), 'hex');
      const Store = require('electron-store').default;
      const store = new Store({ cwd: directory, name: 'spectro-v2', encryptionKey: key });
      return { hasOldKey: store.has('openaiApiKey'), inlineImage: !!store.get('responseHistory')[0].screenshot };
    }, directory);
    expect(data).toEqual({ hasOldKey: false, inlineImage: false });
    expect(await fs.readFile(path.join(directory, 'config.json'))).toEqual(original);
    await app.close();
    app = await launch();
    page = await app.firstWindow();
    await expect(page.locator('#history-indicator')).toHaveText('1 saved');
    await page.locator('#history-prev').click();
    await expect(page.locator('#screenshot-section')).toBeVisible();
  } finally { await app?.close(); await fs.rm(directory, { recursive: true, force: true }); }
});
