// Holt US-Kurse über die offizielle Finnhub-API (Key aus GitHub-Secret FINNHUB_KEY),
// rechnet mit dem EZB-Kurs (frankfurter.dev) in EUR um und schreibt prices.json.
import { readFile, writeFile } from 'node:fs/promises';

const KEY = process.env.FINNHUB_KEY;
if (!KEY) { console.error('FINNHUB_KEY fehlt (Settings → Secrets and variables → Actions).'); process.exit(1); }

const stocks = JSON.parse(await readFile(new URL('../stocks.json', import.meta.url)));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const isUS = t => t && !t.includes('.') && !t.includes('=');

const fx = await (await fetch('https://api.frankfurter.dev/v1/latest?from=USD&to=EUR')).json();
const usdEur = fx?.rates?.EUR;
if (!usdEur) { console.error('Wechselkurs nicht abrufbar', fx); process.exit(1); }

const prices = {}, failed = [];
const tickers = [...new Set(stocks.map(s => s.ticker).filter(isUS))];
for (let i = 0; i < tickers.length; i++) {
  const t = tickers[i];
  const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(t.replace('-', '.'))}&token=${KEY}`);
  if (r.status === 429) { await sleep(5000); i--; continue; }
  if (r.status === 401 || r.status === 403) { console.error('Finnhub-Key ungültig:', r.status); process.exit(1); }
  const q = r.ok ? await r.json() : null;
  if (q && q.c) prices[t] = { eur: Math.round(q.c * usdEur * 100) / 100, day: q.dp, usd: q.c };
  else failed.push(t);
  await sleep(1100);   // Gratis-Tarif: max. 60 Abfragen/Minute
}

await writeFile(new URL('../prices.json', import.meta.url),
  JSON.stringify({ updated: new Date().toISOString(), usdEur, prices, failed }, null, 1));
console.log(`OK: ${Object.keys(prices).length}, nicht gefunden: ${failed.join(', ') || '–'}`);
