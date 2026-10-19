import { readFile } from 'node:fs/promises';

const cases = JSON.parse(await readFile(new URL('../tests/retrieval/moment-cases.json', import.meta.url), 'utf8'));
const base = process.argv[2] ?? 'https://evolutionmedia.vercel.app';
let failed = false;
for (const item of cases) {
  try {
    const response = await fetch(new URL('/api/moments', base), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: item.query }), signal: AbortSignal.timeout(60_000),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(`HTTP ${response.status} (${result.code ?? 'unavailable'}): ${result.error ?? 'Search unavailable'}`);
    const titles = result.songs.map(song => song.title);
    const pass = item.expectedAny.length ? item.expectedAny.some(title => titles.includes(title)) : !titles.length;
    console.log(JSON.stringify({ name: item.name, pass, returnedTitles: titles, expectedAny: item.expectedAny }));
    if (!pass) failed = true;
  } catch (error) {
    console.log(JSON.stringify({ name: item.name, pass: false, error: error.message }));
    failed = true;
  }
}
if (failed) process.exitCode = 1;
