import type { TimerState, WorkerRequest } from './types.js';

// Looks up an element by id and checks its class, so callers get a typed element without `!`.
export function el<T extends HTMLElement>(id: string, type: new () => T): T {
  const node = document.getElementById(id);
  if (!(node instanceof type)) {
    throw new Error(`LookBusy: expected #${id} to be a ${type.name}, found ${node ? node.constructor.name : 'nothing'}`);
  }
  return node;
}

export function send(req: WorkerRequest): Promise<TimerState> {
  // chrome.runtime.sendMessage resolves to `any`; every WorkerRequest responds with TimerState.
  return chrome.runtime.sendMessage(req) as Promise<TimerState>;
}
