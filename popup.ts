import { SESSION_TYPES } from './src/constants.js';
import type { TimerState } from './src/types.js';
import { el, send } from './src/ui.js';

let state: TimerState | null = null;

function remaining(s: TimerState): number {
  // A running timer always has endsAt set.
  return s.status === 'running' ? Math.max(0, s.endsAt! - Date.now()) : s.remainingMs;
}

function format(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = String(Math.floor(total / 60)).padStart(2, '0');
  const s = String(total % 60).padStart(2, '0');
  return `${m}:${s}`;
}

function render(): void {
  if (!state) return;
  el('type', HTMLElement).textContent = SESSION_TYPES[state.type].label;
  el('time', HTMLElement).textContent = format(remaining(state));
  el('startPause', HTMLButtonElement).textContent = state.status === 'running' ? 'Pause' : state.status === 'paused' ? 'Resume' : 'Start';
  const task = el('task', HTMLInputElement);
  if (document.activeElement !== task) task.value = state.task;
  el('count', HTMLElement).textContent = `Focus sessions completed: ${state.completedFocus}`;
}

async function refresh(): Promise<void> {
  state = await send({ action: 'getState' });
  render();
}

el('startPause', HTMLButtonElement).addEventListener('click', async () => {
  // Known issue: clicking before the first refresh() resolves throws here, as before.
  state = state!.status === 'running'
    ? await send({ action: 'pause' })
    : await send({ action: 'start', task: el('task', HTMLInputElement).value });
  render();
});
el('reset', HTMLButtonElement).addEventListener('click', async () => { state = await send({ action: 'reset' }); render(); });
el('skip', HTMLButtonElement).addEventListener('click', async () => { state = await send({ action: 'skip' }); render(); });
el('task', HTMLInputElement).addEventListener('input', () => send({ action: 'setTask', task: el('task', HTMLInputElement).value }));
el('options', HTMLAnchorElement).addEventListener('click', (e) => { e.preventDefault(); chrome.runtime.openOptionsPage(); });

chrome.storage.onChanged.addListener((_c, area) => { if (area === 'local') refresh(); });
setInterval(render, 500);
refresh();
