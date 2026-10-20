'use strict';
const api = window.electronAPI;
const $ = id => document.getElementById(id);
let settings;
let connections = {};
let screenshot = null;
let activeId = null;
let response = '';
let history = [];
let historyIndex = -1;
let viewing = null;
let draft;
let changing = false;
let historyGeneration = 0;
let notificationTimer;

function notify(message) {
  $('notification').textContent = message;
  $('notification').classList.remove('hidden');
  clearTimeout(notificationTimer);
  notificationTimer = setTimeout(() => $('notification').classList.add('hidden'), 4500);
}
function status(message, error = false) {
  $('status-message').textContent = message;
  $('status-message').classList.toggle('error', error);
}
function controls() {
  $('submit-button').disabled = !settings || !!activeId || changing || !!viewing || (!$('input-textarea').value.trim() && !screenshot);
  $('stop-button').classList.toggle('hidden', !activeId);
  $('capture-button').disabled = !!activeId;
  $('history-prev').disabled = !!activeId || changing || !history.length || historyIndex === 0;
  $('history-next').disabled = !!activeId || changing || historyIndex === -1;
  $('resume-history').disabled = !!activeId || changing || !viewing?.sessionId || (viewing.provider === 'claude' && !viewing.messageId);
  document.querySelectorAll('.provider-btn, .claude-model-btn').forEach(button => { button.disabled = changing; });
}
function showSettings(value) {
  settings = value;
  document.querySelectorAll('.provider-btn').forEach(button => {
    const active = button.dataset.provider === settings.provider;
    button.classList.toggle('active', active); button.setAttribute('aria-pressed', active);
  });
  document.querySelectorAll('.claude-model-btn').forEach(button => {
    const active = button.dataset.model === settings.claudeModel;
    button.classList.toggle('active', active); button.setAttribute('aria-pressed', active);
  });
  $('astra-label').classList.toggle('hidden', settings.provider !== 'openai');
  $('claude-models').classList.toggle('hidden', settings.provider !== 'claude');
  const connection = connections[settings.provider];
  $('connection-status').textContent = connection ? (connection.authenticated ? 'Connected' : 'Setup needed') : 'Checking…';
  $('connection-status').title = connection?.message || '';
  controls();
}
async function changeSettings(patch) {
  if (!settings || changing) return;
  changing = true; controls();
  try { showSettings(await api.saveSettings({ ...settings, ...patch })); }
  catch (error) { notify(error.message); }
  finally { changing = false; controls(); }
}
function setScreenshot(value) {
  screenshot = value;
  if (value) $('screenshot-img').src = value;
  else { $('screenshot-img').removeAttribute('src'); $('instructions-textarea').value = ''; }
  $('screenshot-section').classList.toggle('hidden', !value);
  controls();
}
function historyLabel() {
  $('history-indicator').textContent = historyIndex === -1 ? (history.length ? `${history.length} saved` : 'No history') : `${historyIndex + 1}/${history.length}`;
  $('history-actions').classList.toggle('hidden', !viewing);
  controls();
}
async function loadHistory() { history = await api.getHistory(); historyIndex = -1; viewing = null; historyLabel(); }
async function navigate(direction) {
  if (activeId || changing || !history.length) return;
  const next = historyIndex === -1 ? (direction < 0 ? history.length - 1 : -1) : historyIndex + direction;
  if (next < 0) return;
  if (historyIndex === -1) draft = { input: $('input-textarea').value, instructions: $('instructions-textarea').value, response, screenshot, model: $('response-model').textContent };
  const generation = ++historyGeneration;
  if (next >= history.length) {
    historyIndex = -1; viewing = null;
    if (draft) {
      $('input-textarea').value = draft.input; setScreenshot(draft.screenshot);
      $('instructions-textarea').value = draft.instructions; response = draft.response;
      $('response-model').textContent = draft.model; window.renderAnswer($('response-textarea'), response);
    }
  } else {
    const entry = await api.getHistoryEntry(history[next].id);
    if (generation !== historyGeneration) return;
    historyIndex = next; viewing = entry;
    $('input-textarea').value = entry.input || '';
    setScreenshot(entry.screenshot); $('instructions-textarea').value = entry.instructions || '';
    response = entry.response || '';
    $('response-model').textContent = entry.model || entry.provider;
    window.renderAnswer($('response-textarea'), response, entry.format);
  }
  status(''); historyLabel();
}
async function submit() {
  if ($('submit-button').disabled || activeId) return;
  historyGeneration++;
  activeId = crypto.randomUUID();
  const id = activeId;
  response = '';
  window.MathJax.typesetClear?.([$('response-textarea')]);
  $('response-textarea').textContent = '';
  status('Connecting…'); controls();
  try {
    const result = await api.submit({ requestId: id, text: $('input-textarea').value, instructions: $('instructions-textarea').value, screenshot });
    if (activeId !== id) return;
    if (result.ok) {
      response = result.text;
      $('response-model').textContent = result.model;
      await window.renderAnswer($('response-textarea'), response);
      status('Saved · follow-up questions keep this conversation');
      await loadHistory();
    } else {
      status(result.error, result.code !== 'CANCELLED');
      if (response) await window.renderAnswer($('response-textarea'), response);
      // Keep partial output visible, but do not archive it as a completed answer.
    }
  } catch (error) { status(error.message, true); }
  finally { if (activeId === id) activeId = null; controls(); }
}
async function reset() {
  await api.newChat();
}
function clearView() {
  historyGeneration++;
  activeId = null; response = ''; viewing = null; historyIndex = -1; draft = null;
  $('input-textarea').value = ''; setScreenshot(null); api.removeScreenshot();
  window.MathJax.typesetClear?.([$('response-textarea')]);
  $('response-textarea').textContent = '';
  $('response-model').textContent = 'Response';
  status('New conversations started'); historyLabel(); $('input-textarea').focus();
}
api.onSettings(showSettings);
api.onScreenshot(value => { setScreenshot(value); $('instructions-textarea').focus(); });
api.onReset(clearView);
api.onFocus(() => (screenshot ? $('instructions-textarea') : $('input-textarea')).focus());
api.onNotification(notify);
api.onHistoryChanged(() => loadHistory().catch(error => notify(error.message)));
api.onEvent(event => {
  if (event.requestId !== activeId) return;
  if (event.type === 'started') { $('response-model').textContent = event.model; status('Working…'); }
  if (event.type === 'model') $('response-model').textContent = event.model;
  if (event.type === 'delta') {
    response += event.text;
    const area = $('response-textarea');
    const atBottom = area.scrollHeight - area.scrollTop - area.clientHeight < 60;
    area.textContent = response;
    if (atBottom) area.scrollTop = area.scrollHeight;
    status('Receiving response…');
  }
  if (event.type === 'usage' && event.usage?.status === 'allowed_warning') status('Approaching your subscription usage limit.');
});
document.querySelectorAll('.provider-btn').forEach(button => button.addEventListener('click', () => changeSettings({ provider: button.dataset.provider })));
document.querySelectorAll('.claude-model-btn').forEach(button => button.addEventListener('click', () => changeSettings({ claudeModel: button.dataset.model })));
$('submit-button').addEventListener('click', submit);
$('stop-button').addEventListener('click', () => { status('Stopping…'); api.cancel(activeId).catch(error => notify(error.message)); });
$('new-chat').addEventListener('click', () => reset().catch(error => notify(error.message)));
$('dismiss-button').addEventListener('click', () => api.dismiss());
$('settings-button').addEventListener('click', () => api.openSettings());
$('capture-button').addEventListener('click', () => api.capture().catch(error => status(error.message, true)));
$('remove-screenshot-button').addEventListener('click', () => { setScreenshot(null); api.removeScreenshot(); });
$('input-textarea').addEventListener('input', controls);
$('history-prev').addEventListener('click', () => navigate(-1).catch(error => notify(error.message)));
$('history-next').addEventListener('click', () => navigate(1).catch(error => notify(error.message)));
$('copy-response').addEventListener('click', () => navigator.clipboard.writeText(response).then(() => notify('Copied')).catch(() => notify('Clipboard unavailable.')));
$('resume-history').addEventListener('click', async () => {
  if (!viewing || changing) return;
  changing = true; controls();
  try {
    showSettings(await api.resumeHistory(viewing.id));
    viewing = null; historyIndex = -1; $('input-textarea').value = ''; setScreenshot(null); api.removeScreenshot();
    historyLabel(); status('Conversation restored. Ask a follow-up.'); $('input-textarea').focus();
  } catch (error) { notify(error.message); }
  finally { changing = false; controls(); }
});
document.addEventListener('keydown', event => {
  const command = api.platform === 'darwin' ? event.metaKey : event.ctrlKey;
  if (command && event.key === 'Enter') { event.preventDefault(); submit(); }
  else if (command && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'r') {
    event.preventDefault(); reset().catch(error => notify(error.message));
  }
  else if (command && event.shiftKey && event.key.toLowerCase() === 'c') { event.preventDefault(); $('copy-response').click(); }
  else if (command && !event.altKey && ['ArrowUp', 'ArrowDown'].includes(event.key)) {
    event.preventDefault(); navigate(event.key === 'ArrowUp' ? -1 : 1).catch(error => notify(error.message));
  } else if (event.key === 'Escape') {
    activeId ? api.cancel(activeId).catch(() => {}) : api.dismiss();
  } else if (['PageUp', 'PageDown'].includes(event.key) || (event.altKey && ['ArrowUp', 'ArrowDown'].includes(event.key))) {
    event.preventDefault(); $('response-textarea').scrollBy({ top: ['PageUp', 'ArrowUp'].includes(event.key) ? -200 : 200, behavior: 'smooth' });
  }
});
$('submit-hint').textContent = `${api.platform === 'darwin' ? '⌘' : 'Ctrl'} Enter to send`;
Promise.all([api.getSettings(), api.getHistory()]).then(([value, entries]) => {
  history = entries; showSettings(value); historyLabel();
  return api.getConnections();
}).then(value => { connections = value; showSettings(settings); }).catch(error => status(error.message, true));
window.addEventListener('focus', () => {
  api.getConnections().then(value => { connections = value; if (settings) showSettings(settings); }).catch(() => {});
});
