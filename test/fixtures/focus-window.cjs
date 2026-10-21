const { app, BrowserWindow } = require('electron');

app.whenReady().then(async () => {
  const window = new BrowserWindow({ width: 480, height: 320, show: false });
  await window.loadURL('data:text/html,<title>Focus test</title><p>Independent foreground window</p><script>window.blurCount=0;window.addEventListener("blur",()=>window.blurCount++);</script>');
  globalThis.blurCount = 0;
  window.on('blur', () => globalThis.blurCount++);
  window.show();
  window.focus();
});
app.on('window-all-closed', () => app.quit());
