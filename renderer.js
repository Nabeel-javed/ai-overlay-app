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
let comparison = null;
let activeComparison = false;
const names = { openai: 'GPT-6 Astra', claude: 'Claude', grok: 'Grok 4.7' };
function showComparison(results = null) {
  comparison = results;
  const visible = !!results;
  $('comparison-panels').classList.toggle('hidden', !visible);
  $('comparison-note').classList.toggle('hidden', !visible);
  $('response-textarea').classList.toggle('hidden', visible);
  if (!visible) return;
  $('comparison-panels').replaceChildren();
  for (const result of results) {
    const card = document.createElement('section');
    card.className = 'answer-card'; card.dataset.provider = result.provider;
    const header = document.createElement('header');
    const label = document.createElement('strong'); label.className = 'card-model'; label.textContent = result.model;
    const copy = document.createElement('button'); copy.textContent = 'Copy'; copy.setAttribute('aria-label', `Copy ${names[result.provider]} answer`);
    copy.addEventListener('click', () => navigator.clipboard.writeText(result.text || '').then(() => notify('Copied')).catch(() => notify('Clipboard unavailable.')));
    const stop = document.createElement('button'); stop.className = 'card-stop danger'; stop.textContent = 'Stop';
    stop.setAttribute('aria-label', `Stop ${names[result.provider]}`);
    stop.addEventListener('click', () => api.cancel(activeId, result.provider).catch(error => notify(error.message)));
    const state = document.createElement('div'); state.className = 'card-status'; state.setAttribute('role', 'status');
    const area = document.createElement('div'); area.className = 'response-area'; area.tabIndex = 0;
    header.append(label, copy, stop); card.append(header, state, area); $('comparison-panels').append(card);
    updateCard(result, true);
  }
}
function updateCard(result, render = false) {
  const card = document.querySelector(`.answer-card[data-provider="${result.provider}"]`);
  if (!card) return;
  card.querySelector('.card-model').textContent = result.model;
  card.querySelector('.card-stop').classList.toggle('hidden', !result.pending);
  const state = card.querySelector('.card-status');
  state.textContent = result.pending ? (result.text ? 'Receiving…' : 'Working…')
    : result.ok ? `Complete${result.elapsed ? ` · ${result.elapsed}s` : ''}`
      : result.error ? `${result.error}${result.contextReset ? ' Next message starts a new conversation for this model.' : ''}` : 'Ready';
  state.classList.toggle('error', result.ok === false && result.code !== 'CANCELLED');
  const area = card.querySelector('.response-area');
  if (render) window.renderAnswer(area, result.text || '');
  else {
    const bottom = area.scrollHeight - area.scrollTop - area.clientHeight < 60;
    area.textContent = result.text || '';
    if (bottom) area.scrollTop = area.scrollHeight;
  }
  const allComplete = comparison?.length === 3 && comparison.every(answer => answer.ok && !answer.pending);
  const identical = allComplete && comparison.every(answer => answer.text.trim() === comparison[0].text.trim());
  $('comparison-note').textContent = identical
    ? 'All three returned identical text. Agreement does not prove correctness.'
    : 'Each model remembers your questions and its own answers. Agreement does not prove correctness.';
}
function comparisonText() { return comparison?.map(result => `## ${result.model}\n\n${result.ok === false ? result.error : result.text || ''}`).join('\n\n'); }

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
  $('attach-button').disabled = !!activeId || !!viewing;
  $('history-prev').disabled = !!activeId || changing || !history.length || historyIndex === 0;
  $('history-next').disabled = !!activeId || changing || historyIndex === -1;
  $('resume-history').disabled = !!activeId || changing || !viewing?.sessionId || viewing.provider === 'grok' || (viewing.provider === 'claude' && !viewing.messageId);
  document.querySelectorAll('.provider-btn').forEach(button => { button.disabled = changing; });
}
function showSettings(value) {
  settings = value;
  document.querySelectorAll('.provider-btn').forEach(button => {
    const active = button.dataset.provider === (settings.mode === 'compare' ? 'compare' : settings.provider);
    button.classList.toggle('active', active); button.setAttribute('aria-pressed', active);
  });
  $('astra-label').classList.toggle('hidden', settings.mode !== 'compare' && settings.provider !== 'openai');
  $('grok-label').classList.toggle('hidden', settings.mode === 'compare' || settings.provider !== 'grok');
  $('claude-label').classList.toggle('hidden', settings.mode !== 'compare' && settings.provider !== 'claude');
  const connection = connections[settings.provider];
  $('connection-status').textContent = connection ? (connection.authenticated ? 'Connected' : 'Setup needed') : 'Checking…';
  $('connection-status').title = connection?.message || '';
  if (settings.mode === 'compare') {
    const count = Object.values(connections).filter(item => item.authenticated).length;
    $('connection-status').textContent = Object.keys(connections).length ? `${count}/3 connected` : 'Checking…';
    $('connection-status').title = Object.entries(connections).map(([provider, value]) => `${names[provider]}: ${value.message}`).join('\n');
  }
  if (!activeId && !viewing && !response && !comparison?.some(result => result.text || result.error)) {
    showComparison(settings.mode === 'compare' ? ['openai', 'claude', 'grok'].map(provider => ({ provider, model: provider === 'claude' ? 'Claude Opus' : names[provider] })) : null);
  }
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
async function attachImage(file) {
  if (activeId || viewing || !file) return;
  if (!['image/png', 'image/jpeg'].includes(file.type) || file.size > 6 * 1024 * 1024) return notify('Use a PNG or JPEG image smaller than 6 MB.');
  const generation = historyGeneration;
  const value = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read this image.'));
    reader.readAsDataURL(file);
  });
  if (activeId || viewing || generation !== historyGeneration) return;
  setScreenshot(value);
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
  if (historyIndex === -1) draft = { input: $('input-textarea').value, instructions: $('instructions-textarea').value, response, screenshot, comparison, model: $('response-model').textContent };
  const generation = ++historyGeneration;
  if (next >= history.length) {
    historyIndex = -1; viewing = null;
    if (draft) {
      $('input-textarea').value = draft.input; setScreenshot(draft.screenshot);
      $('instructions-textarea').value = draft.instructions; response = draft.response;
      $('response-model').textContent = draft.model; window.renderAnswer($('response-textarea'), response);
      showComparison(draft.comparison);
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
    showComparison(entry.results || null);
  }
  status(''); historyLabel();
}
async function submit() {
  if ($('submit-button').disabled || activeId) return;
  historyGeneration++;
  activeId = crypto.randomUUID();
  const id = activeId;
  activeComparison = settings.mode === 'compare';
  showComparison(activeComparison ? ['openai', 'claude', 'grok'].map(provider => ({
    provider, model: provider === 'claude' ? 'Claude Opus' : names[provider], text: '', pending: true, startedAt: performance.now(),
  })) : null);
  $('response-model').textContent = activeComparison ? 'Three independent answers' : 'Response';
  response = '';
  window.MathJax.typesetClear?.([$('response-textarea')]);
  $('response-textarea').textContent = '';
  status('Connecting…'); controls();
  try {
    const result = await api.submit({ requestId: id, text: $('input-textarea').value, instructions: $('instructions-textarea').value, screenshot });
    if (activeId !== id) return;
    if (result.comparison) {
      // Terminal IPC also recovers a card if a streamed completion event was missed.
      for (const answer of result.results) {
        const card = comparison.find(item => item.provider === answer.provider);
        Object.assign(card, answer, { pending: false }); updateCard(card, true);
      }
      const count = result.results.filter(answer => answer.ok).length;
      status(`${count}/3 completed${count ? ' · comparison saved' : ''} · ${result.results.some(answer => answer.contextReset)
        ? 'failed models restart on the next message' : 'follow-ups keep each model’s conversation'}`, count === 0);
      await loadHistory();
    } else if (result.ok) {
      showComparison(null);
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
  finally {
    if (activeId === id) {
      activeId = null;
      for (const card of comparison || []) if (card.pending) {
        Object.assign(card, { pending: false, ok: false, error: 'Request ended before this answer completed.' }); updateCard(card, true);
      }
    }
    controls();
  }
}
async function reset() {
  await api.newChat();
}
function clearView(message = 'New conversations started') {
  historyGeneration++;
  activeId = null; response = ''; viewing = null; historyIndex = -1; draft = null;
  showComparison(null);
  $('input-textarea').value = ''; setScreenshot(null);
  window.MathJax.typesetClear?.([$('response-textarea')]);
  $('response-textarea').textContent = '';
  $('response-model').textContent = 'Response';
  status(message); historyLabel();
  if (document.hasFocus()) $('input-textarea').focus();
  if (settings) showSettings(settings);
}
api.onSettings(showSettings);
api.onScreenshot(value => {
  setScreenshot(value);
  if (document.hasFocus()) $('instructions-textarea').focus();
});
api.onReset(clearView);
api.onRefresh(() => {
  if (activeId || changing) return notify('Wait for the current action to finish before refreshing.');
  clearView('Screen cleared · conversations kept');
});
api.onFocus(() => (screenshot ? $('instructions-textarea') : $('input-textarea')).focus());
api.onNotification(notify);
api.onHistoryChanged(() => loadHistory().catch(error => notify(error.message)));
api.onEvent(event => {
  if (event.requestId !== activeId) return;
  if (activeComparison && comparison && event.provider) {
    const card = comparison.find(result => result.provider === event.provider);
    if (!card) return;
    if (event.type === 'started' || event.type === 'model') card.model = event.model;
    if (event.type === 'delta') card.text += event.text;
    if (event.type === 'finished') Object.assign(card, event.result, { pending: false, elapsed: ((performance.now() - card.startedAt) / 1000).toFixed(1) });
    updateCard(card, event.type === 'finished');
    return;
  }
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
document.querySelectorAll('.provider-btn').forEach(button => button.addEventListener('click', () => changeSettings(
  button.dataset.provider === 'compare' ? { mode: 'compare' } : { provider: button.dataset.provider, mode: 'single' })));
$('submit-button').addEventListener('click', submit);
$('stop-button').addEventListener('click', () => { status('Stopping…'); api.cancel(activeId).catch(error => notify(error.message)); });
$('new-chat').addEventListener('click', () => reset().catch(error => notify(error.message)));
$('dismiss-button').addEventListener('click', () => api.dismiss());
$('settings-button').addEventListener('click', () => api.openSettings());
$('capture-button').addEventListener('click', () => api.capture().catch(error => status(error.message, true)));
$('attach-button').addEventListener('click', () => $('image-file').click());
$('image-file').addEventListener('change', event => {
  attachImage(event.target.files[0]).catch(error => notify(error.message)); event.target.value = '';
});
document.addEventListener('paste', event => {
  const image = [...(event.clipboardData?.items || [])].find(item => item.type.startsWith('image/'));
  if (image && !activeId && !viewing) {
    event.preventDefault(); attachImage(image.getAsFile()).catch(error => notify(error.message));
  }
});
$('remove-screenshot-button').addEventListener('click', () => { setScreenshot(null); api.removeScreenshot(); });
$('input-textarea').addEventListener('input', controls);
$('history-prev').addEventListener('click', () => navigate(-1).catch(error => notify(error.message)));
$('history-next').addEventListener('click', () => navigate(1).catch(error => notify(error.message)));
$('copy-response').addEventListener('click', () => navigator.clipboard.writeText(comparisonText() || response).then(() => notify('Copied')).catch(() => notify('Clipboard unavailable.')));
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
