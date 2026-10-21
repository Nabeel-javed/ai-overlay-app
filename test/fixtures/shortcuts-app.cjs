const { app, globalShortcut } = require('electron');

// Run the actual shortcut registration against an isolated app without reserving OS hotkeys.
app.setPath('userData', process.env.SPECTRO_TEST_USER_DATA);
delete process.env.SPECTRO_TEST_USER_DATA;
globalThis.shortcutActions = new Map();
globalShortcut.register = (accelerator, action) => {
  globalThis.shortcutActions.set(accelerator, action);
  return true;
};
globalThis.requestInputs = [];
for (const [name, file, type] of [['openai', 'codex', 'Codex'], ['claude', 'claude', 'Claude'], ['grok', 'grok', 'Grok']]) {
  const Provider = require(`../../src/providers/${file}.js`)[`${type}Provider`];
  Provider.prototype.run = async (request, session) => {
    globalThis.requestInputs.push({ provider: name, request, session });
    if (globalThis.responseGate) await globalThis.responseGate;
    return { text: `${name} answer`, actualModel: request.model, sessionId: session?.sessionId || `thread-${name}` };
  };
}
require('../../main.js');
