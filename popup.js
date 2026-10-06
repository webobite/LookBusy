import { SESSION_TYPES } from './src/constants.js';

const $ = (id) => document.getElementById(id);
const send = (action, extra = {}) => chrome.runtime.sendMessage({ action, ...extra });
let state = null;

function remaining() {
  return state.status === 'running' ? Math.max(0, state.endsAt - Date.now()) : state.remainingMs;
}

function format(ms) {
  const total = Math.ceil(ms / 1000);
  const m = String(Math.floor(total / 60)).padStart(2, '0');
  const s = String(total % 60).padStart(2, '0');
  return `${m}:${s}`;
}

function render() {
  if (!state) return;
  $('type').textContent = SESSION_TYPES[state.type].label;
  $('time').textContent = format(remaining());
  $('startPause').textContent = state.status === 'running' ? 'Pause' : state.status === 'paused' ? 'Resume' : 'Start';
  if (document.activeElement !== $('task')) $('task').value = state.task;
  $('count').textContent = `Focus sessions completed: ${state.completedFocus}`;
}

async function refresh() {
  state = await send('getState');
  render();
}

$('startPause').addEventListener('click', async () => {
  state = state.status === 'running' ? await send('pause') : await send('start', { task: $('task').value });
  render();
});
$('reset').addEventListener('click', async () => { state = await send('reset'); render(); });
$('skip').addEventListener('click', async () => { state = await send('skip'); render(); });
$('task').addEventListener('input', () => send('setTask', { task: $('task').value }));
$('options').addEventListener('click', (e) => { e.preventDefault(); chrome.runtime.openOptionsPage(); });

chrome.storage.onChanged.addListener((_c, area) => { if (area === 'local') refresh(); });
setInterval(render, 500);
refresh();
