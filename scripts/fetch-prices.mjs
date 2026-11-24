// Holt aktuelle Kurse von Yahoo Finance, rechnet in EUR um und schreibt prices.json.
// Läuft per GitHub Action (kein CORS-Problem, kein API-Key nötig).
import { readFile, writeFile } from 'node:fs/promises';

const stocks = JSON.parse(await readFile(new URL('../stocks.json', import.meta.url)));
const UA = { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36' };
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function quote(symbol) {
  for (const host of ['query1', 'query2']) {
    try {
      const r = await fetch(`https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5d&interval=1d`, { headers: UA });
      if (!r.ok) continue;
      const j = await r.json();
      const m = j?.chart?.result?.[0]?.meta;
      if (!m || m.regularMarketPrice == null) continue;
      const closes = (j.chart.result[0].indicators?.quote?.[0]?.close || []).filter(x => x != null);
      // Vortages-Schluss: vorletzter Tages-Close (range=5d), sonst chartPreviousClose
      const prev = closes.length >= 2 ? closes[closes.length - 2] : (m.previousClose ?? m.chartPreviousClose);
      return { price: m.regularMarketPrice, prev, currency: m.currency, time: m.regularMarketTime };
    } catch (e) { /* nächster Host */ }
  }
  return null;
}

const fxCache = {};
async function fx(cur) {          // Einheiten der Fremdwährung pro 1 EUR
  if (cur === 'EUR') return { now: 1, prev: 1 };
  if (!fxCache[cur]) {
    const q = await quote(`EUR${cur}=X`);
    fxCache[cur] = q ? { now: q.price, prev: q.prev ?? q.price } : null;
  }
  return fxCache[cur];
}

const out = {};
const failed = [];
for (const s of stocks) {
  if (!s.ticker || out[s.ticker]) continue;
  const q = await quote(s.ticker);
  await sleep(250);
  if (!q) { failed.push(s.ticker); continue; }
  let cur = q.currency || 'USD', div = 1;
  if (cur === 'GBp' || cur === 'GBX') { cur = 'GBP'; div = 100; }
  if (cur === 'ZAc') { cur = 'ZAR'; div = 100; }
  const r = await fx(cur);
  if (!r) { failed.push(s.ticker); continue; }
  const eur = q.price / div / r.now;
  const eurPrev = q.prev ? q.prev / div / r.prev : null;
  out[s.ticker] = {
    eur: Math.round(eur * 10000) / 10000,
    day: eurPrev ? Math.round((eur / eurPrev - 1) * 10000) / 100 : null,
    native: q.price, currency: q.currency, time: q.time
  };
}

await writeFile(new URL('../prices.json', import.meta.url),
  JSON.stringify({ updated: new Date().toISOString(), prices: out, failed }, null, 1));
console.log(`OK: ${Object.keys(out).length}, fehlgeschlagen: ${failed.join(', ') || '–'}`);
