// Copies the non-TypeScript extension files into dist/ next to tsc's output.
import { cp, mkdir } from 'node:fs/promises';

const STATIC = ['manifest.json', 'popup.html', 'options.html', 'offscreen.html', 'styles.css', 'icons'];

await mkdir('dist', { recursive: true });
await Promise.all(STATIC.map((path) => cp(path, `dist/${path}`, { recursive: true })));
