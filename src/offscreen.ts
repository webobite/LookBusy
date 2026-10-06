import type { RuntimeMessage } from './types.js';

chrome.runtime.onMessage.addListener((msg: RuntimeMessage) => {
  if (msg.target !== 'offscreen' || msg.action !== 'beep') return;
  const ctx = new AudioContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = 880;
  gain.gain.setValueAtTime(0.2, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.8);
  osc.onended = () => ctx.close();
});
