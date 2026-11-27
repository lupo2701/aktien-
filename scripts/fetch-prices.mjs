// Holt US-Kurse über die offizielle Finnhub-API (Key aus GitHub-Secret FINNHUB_KEY),
// rechnet mit dem EZB-Kurs (frankfurter.dev) in EUR um, schreibt prices.json
// und führt history.json (ein Kurs pro Tag) für Wochen-/Monatsvergleiche.
import { readFile, writeFile } from 'node:fs/promises';

const KEY = process.env.FINNHUB_KEY;
if (!KEY) { console.error('FINNHUB_KEY fehlt (Settings → Secrets and variables → Actions).'); process.exit(1); }

const file = n => new URL('../' + n, import.meta.url);
const stocks = JSON.parse(await readFile(file('stocks.json')));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const isUS = t => t && !t.includes('.') && !t.includes('=');
const day = d => d.toISOString().slice(0, 10);

const fx = await (await fetch('https://api.frankfurter.dev/v1/latest?from=USD&to=EUR')).json();
const usdEur = fx?.rates?.EUR;
if (!usdEur) { console.error('Wechselkurs nicht abrufbar', fx); process.exit(1); }

async function finnhub(path) {
  for (;;) {
    const r = await fetch(`https://finnhub.io/api/v1/${path}&token=${KEY}`);
    await sleep(1100);                       // Gratis-Tarif: max. 60 Abfragen/Minute
    if (r.status === 429) { await sleep(5000); continue; }
    if (r.status === 401) { console.error('Finnhub-Key ungültig'); process.exit(1); }
    return r.ok ? r.json() : { _status: r.status };
  }
}

// --- aktuelle Kurse ---
const prices = {}, failed = [];
const tickers = [...new Set(stocks.map(s => s.ticker).filter(isUS))];
for (const t of tickers) {
  const q = await finnhub(`quote?symbol=${encodeURIComponent(t.replace('-', '.'))}`);
  if (q && q.c) prices[t] = { eur: Math.round(q.c * usdEur * 100) / 100, day: q.dp, usd: q.c };
  else failed.push(t);
}
await writeFile(file('prices.json'), JSON.stringify({ updated: new Date().toISOString(), usdEur, prices, failed }, null, 1));
console.log(`Kurse OK: ${Object.keys(prices).length}, nicht gefunden: ${failed.join(', ') || '–'}`);

// --- Historie ---
let hist = {};
try { hist = JSON.parse(await readFile(file('history.json'))); } catch {}
const today = day(new Date());
hist[today] = { ...(hist[today] || {}), ...Object.fromEntries(Object.entries(prices).map(([t, p]) => [t, p.eur])) };

// Einmaliges Nachladen älterer Tageskurse (nur falls der Finnhub-Tarif das erlaubt)
const oldest = Object.keys(hist).sort()[0];
const need = (Date.now() - new Date(oldest)) / 864e5 < 95;
if (need) {
  const to = Math.floor(Date.now() / 1000), from = to - 100 * 86400;
  let rates = {};
  try {
    const fr = await (await fetch(`https://api.frankfurter.dev/v1/${day(new Date(from * 1000))}..?from=USD&to=EUR`)).json();
    rates = Object.fromEntries(Object.entries(fr.rates || {}).map(([d, v]) => [d, v.EUR]));
  } catch {}
  const rateOn = d => { const ks = Object.keys(rates).filter(k => k <= d).sort(); return ks.length ? rates[ks[ks.length - 1]] : usdEur; };
  let filled = 0;
  for (const t of tickers) {
    const c = await finnhub(`stock/candle?symbol=${encodeURIComponent(t.replace('-', '.'))}&resolution=D&from=${from}&to=${to}`);
    if (c._status) { console.log(`Ältere Kurse nicht im Gratis-Tarif (HTTP ${c._status}) – Historie wächst ab jetzt täglich.`); break; }
    if (c.s !== 'ok') continue;
    c.t.forEach((ts, i) => {
      const d = day(new Date(ts * 1000));
      if (d === today) return;
      hist[d] = hist[d] || {};
      if (hist[d][t] == null) hist[d][t] = Math.round(c.c[i] * rateOn(d) * 100) / 100;
    });
    filled++;
  }
  if (filled) console.log(`Historie nachgeladen für ${filled} Werte`);
}

// auf ~400 Tage begrenzen
const cut = day(new Date(Date.now() - 400 * 864e5));
for (const d of Object.keys(hist)) if (d < cut) delete hist[d];
const sorted = Object.fromEntries(Object.keys(hist).sort().map(d => [d, hist[d]]));
await writeFile(file('history.json'), JSON.stringify(sorted));
console.log(`Historie: ${Object.keys(sorted).length} Tage`);
