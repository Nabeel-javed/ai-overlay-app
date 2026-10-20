'use strict';
const api = window.settingsAPI;
const $ = id => document.getElementById(id);
let current;
function message(text) { $('settings-message').textContent = text; }
async function refresh() {
  $('refresh-connections').disabled = true;
  try {
    const statuses = await api.getConnections();
    for (const provider of ['openai', 'claude']) {
      const status = statuses[provider];
      $(`${provider}-status`).textContent = `${status.message}${status.version ? ` · v${status.version}` : ''}`;
    }
  } catch (error) { message(error.message); }
  finally { $('refresh-connections').disabled = false; }
}
api.getSettings().then(settings => {
  current = settings; $('provider').value = settings.provider;
  $('claude-model').value = settings.claudeModel; $('effort').value = settings.effort;
  $('save-button').disabled = false;
}).catch(error => message(error.message));
refresh();
$('refresh-connections').addEventListener('click', refresh);
document.querySelectorAll('[data-connect]').forEach(button => button.addEventListener('click', async () => {
  button.disabled = true; message('Complete sign-in in your browser…');
  try { const result = await api.connect(button.dataset.connect); message(result.message); await refresh(); }
  catch (error) { message(error.message); }
  finally { button.disabled = false; }
}));
document.querySelectorAll('[data-guide]').forEach(button => button.addEventListener('click', () => api.openGuide(button.dataset.guide)));
$('save-button').addEventListener('click', async () => {
  $('save-button').disabled = true;
  try {
    current = await api.saveSettings({ ...current, provider: $('provider').value, claudeModel: $('claude-model').value, effort: $('effort').value });
    message('Saved'); api.closeWindow();
  } catch (error) { message(error.message); $('save-button').disabled = false; }
});
$('cancel-button').addEventListener('click', () => api.closeWindow());
$('clear-history').addEventListener('click', async () => {
  if (!confirm('Delete the saved response archive and its attachments from Spectro?')) return;
  try { await api.clearHistory(); message('Saved responses cleared.'); } catch (error) { message(error.message); }
});
