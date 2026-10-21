// Local full-display ScreenCaptureKit probe. No screenshots are stored or sent.
const { _electron } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const execFile = require('node:util').promisify(require('node:child_process').execFile);
async function main() {
  if (process.platform !== 'darwin') throw new Error('Requires macOS 14+ and Xcode command-line tools.');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'spectro-privacy-'));
  const binary = path.join(directory, 'capture-probe');
  const report = { checkedAt: new Date().toISOString(), capture: 'Native ScreenCaptureKit full-display screenshot; no exclusions', windows: {} };
  let app;
  try {
    await execFile('xcrun', ['swiftc', '-parse-as-library', path.resolve('test/fixtures/capture-probe.swift'), '-o', binary], { timeout: 60000 });
    app = await _electron.launch({
      ...(process.argv.includes('--packaged') ? { executablePath: path.resolve('dist/mac-arm64/Spectro.app/Contents/MacOS/Spectro') } : { args: [path.resolve('.')] }),
      env: { ...process.env, SPECTRO_TEST_USER_DATA: directory, ELECTRON_RUN_AS_NODE: undefined },
    });
    const overlay = await app.firstWindow();
    await overlay.waitForSelector('#astra-label');
    const opened = app.waitForEvent('window');
    await overlay.evaluate(() => window.electronAPI.openSettings());
    const settings = await opened;
    await settings.waitForSelector('#provider');
    for (const [name, page, filename] of [['overlay', overlay, 'index.html'], ['settings', settings, 'settings.html']]) {
      await page.evaluate(() => {
        document.body.replaceChildren();
        const marker = document.createElement('div');
        marker.style.cssText = 'position:fixed;inset:0;background:rgb(242,17,215);display:grid;place-items:center;color:white;font:20px sans-serif';
        marker.textContent = 'Spectro screen-capture privacy test';
        document.body.append(marker);
      });
      const checks = report.windows[name] = {};
      for (const [phase, protectedWindow] of [['control', false], ['protected', true], ['controlAfter', false]]) {
        const windowState = await app.evaluate(async ({ BrowserWindow, screen }, { filename, protectedWindow }) => {
          const windows = BrowserWindow.getAllWindows();
          // Showing a child can reveal its parent on macOS. Keep every other
          // window protected so the marker measures only the selected target.
          windows.forEach(window => { window.setContentProtection(true); window.hide(); });
          const win = windows.find(window => window.webContents.getURL().endsWith(`/${filename}`));
          win.setOpacity(1); win.setContentProtection(protectedWindow); win.show();
          const display = screen.getDisplayMatching(win.getBounds());
          await new Promise(resolve => setTimeout(resolve, 700));
          return { displayId: display.id, requestedProtection: protectedWindow, reportedProtection: win.isContentProtected() };
        }, { filename, protectedWindow });
        const { stdout } = await execFile(binary, [String(windowState.displayId)], { timeout: 20000 });
        checks[phase] = { ...windowState, ...JSON.parse(stdout) };
      }
      if (!checks.control.permission || !checks.protected.permission || !checks.controlAfter.permission) checks.result = 'BLOCKED: screen recording permission unavailable';
      else if (checks.control.markerPixels < 10000 || checks.controlAfter.markerPixels < 10000) checks.result = 'INCONCLUSIVE: calibration marker missing';
      else {
        checks.protectedToControlRatio = checks.protected.markerPixels / Math.min(checks.control.markerPixels, checks.controlAfter.markerPixels);
        checks.result = checks.protectedToControlRatio > 0.5 ? 'FAIL: protected window remains visible'
          : checks.protectedToControlRatio < 0.01 ? 'PASS for this capture path only: window excluded' : 'INCONCLUSIVE: partial marker captured';
      }
      if (!checks.result.startsWith('PASS')) process.exitCode = 1;
    }
  } finally {
    await app?.close();
    await fs.rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    await fs.mkdir('.artifacts', { recursive: true });
    await fs.writeFile('.artifacts/capture-privacy-check.json', JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
