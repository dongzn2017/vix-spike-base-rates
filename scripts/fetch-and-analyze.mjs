#!/usr/bin/env node
// Reproduce the VIX-spike base-rate study shipped with this repository.
// Dependency-free: Node 18+ standard library only.
//
//   node scripts/fetch-and-analyze.mjs
//
// Writes derived CSVs into data/ and prints a self-check against the published
// figures. Only derived statistics are written: daily prices from the upstream
// provider are not redistributed (see README.md, "Data licensing").

import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const UA = { 'user-agent': 'vix-spike-base-rates reproduction script (personal research; see README.md)' };
const ENDPOINT = (symbol) => `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=20y&interval=1d`;
const SYMBOLS = { '^GSPC': 'spx', '^IXIC': 'ndx', '^VIX': 'vix', '^SOX': 'sox', 'CL=F': 'wti' };
const START = '2006-10-17';
const END = '2026-10-16';

async function series(symbol) {
  const response = await fetch(ENDPOINT(symbol), { headers: UA, signal: AbortSignal.timeout(90_000) });
  if (!response.ok) throw new Error(`${symbol} -> HTTP ${response.status}`);
  const json = await response.json();
  const result = json.chart?.result?.[0];
  if (!result) throw new Error(`${symbol}: unexpected response shape`);
  const times = result.timestamp;
  const closes = result.indicators.quote[0].close;
  const rows = times.map((t, i) => [new Date(t * 1000).toISOString().slice(0, 10), closes[i]])
    .filter(([d, v]) => v !== null && v !== undefined && d >= START && d <= END);
  if (rows.length < 4000) throw new Error(`${symbol}: only ${rows.length} rows, expected ~5000`);
  return rows;
}

const pct = (a, i, j) => (a[j][1] / a[i][1] - 1) * 100;
const at = (a, date) => a.findIndex((x) => x[0] === date);
const median = (v) => { const s = v.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const quantile = (v, q) => { const s = v.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.max(0, Math.floor(q * (s.length - 1))))]; };
const r2 = (v) => v.map((x) => Math.round(x * 100) / 100);

const [spx, ndx, vix, sox] = await Promise.all(Object.keys(SYMBOLS).slice(0, 4).map((s) => series(s)));

// Filter: VIX rises at least 15% in one session and closes at or above 18.
const episodes = [];
for (let i = 1; i < vix.length; i++) {
  const jump1 = (vix[i][1] / vix[i - 1][1] - 1) * 100;
  if (jump1 < 15 || vix[i][1] < 18) continue;
  const date = vix[i][0], si = at(spx, date), ni = at(ndx, date), oi = at(sox, date);
  if (si < 0 || ni < 0) continue;
  const horizonOk = (a, i, h) => i + h < a.length;
  const fwd = (a, i, h) => (horizonOk(a, i, h) ? +pct(a, i, i + h).toFixed(2) : '');
  const staysElevated = i + 5 < vix.length ? vix[i + 5][1] >= vix[i][1] : null;
  episodes.push({
    date,
    vix_close: +vix[i][1].toFixed(2),
    vix_jump_1d_pct: +jump1.toFixed(2),
    vix_jump_5d_pct: i >= 5 ? +pct(vix, i - 5, i).toFixed(2) : '',
    spx_1d_pct: si > 0 ? +pct(spx, si - 1, si).toFixed(2) : '',
    ndx_1d_pct: ni > 0 ? +pct(ndx, ni - 1, ni).toFixed(2) : '',
    spx_fwd5_pct: fwd(spx, si, 5), spx_fwd10_pct: fwd(spx, si, 10), spx_fwd21_pct: fwd(spx, si, 21),
    ndx_fwd5_pct: fwd(ndx, ni, 5), ndx_fwd10_pct: fwd(ndx, ni, 10), ndx_fwd21_pct: fwd(ndx, ni, 21),
    sox_fwd5_pct: oi >= 0 ? fwd(sox, oi, 5) : '',
    vix_5d_later: i + 5 < vix.length ? +vix[i + 5][1].toFixed(2) : '',
    vix_stays_elevated_5d: staysElevated === null ? '' : staysElevated ? 'yes' : 'no',
  });
}

const numeric = (rows, key) => rows.map((x) => x[key]).filter((v) => v !== '' && Number.isFinite(v));

// A second, independent filter family (not a subset of the episodes above, because it
// does not require a VIX close at or above 18): a volatility-compression break.
const volBreak = [];
for (let i = 5; i < vix.length; i++) {
  const jump1 = (vix[i][1] / vix[i - 1][1] - 1) * 100;
  if (jump1 < 20 || vix[i - 5][1] > 16.5) continue;
  const date = vix[i][0], si = at(spx, date), ni = at(ndx, date);
  if (si < 0 || ni < 0) continue;
  const fwd = (a, i2, h) => (i2 + h < a.length ? +pct(a, i2, i2 + h).toFixed(2) : '');
  volBreak.push({ date, vix_close: +vix[i][1].toFixed(2), vix_jump_1d_pct: +jump1.toFixed(2), vix_5d_prior: +vix[i - 5][1].toFixed(2), spx_fwd5_pct: fwd(spx, si, 5), spx_fwd10_pct: fwd(spx, si, 10), spx_fwd21_pct: fwd(spx, si, 21), ndx_fwd21_pct: fwd(ndx, ni, 21) });
}

// Episodes with a complete 21-session forward window: this excludes the spike day itself
// when it falls at the end of the sample (2026-10-16), which is why the article quotes 167.
const withWindow = episodes.filter((e) => e.spx_fwd21_pct !== '');

const groups = {
  all: withWindow,
  vix_18_to_22: withWindow.filter((e) => e.vix_close >= 18 && e.vix_close <= 22),
  vol_compression_break: volBreak,
  vix_stays_elevated: withWindow.filter((e) => e.vix_stays_elevated_5d === 'yes'),
  vix_fades: withWindow.filter((e) => e.vix_stays_elevated_5d === 'no'),
};

const summary = [];
for (const [name, rows] of Object.entries(groups)) {
  for (const key of ['spx_fwd5_pct', 'spx_fwd10_pct', 'spx_fwd21_pct', 'ndx_fwd5_pct', 'ndx_fwd10_pct', 'ndx_fwd21_pct', 'sox_fwd5_pct']) {
    const v = numeric(rows, key);
    if (!v.length) continue;
    summary.push({
      group: name, n: rows.length, metric: key, n_obs: v.length,
      median_pct: +median(v).toFixed(2), p10_pct: +quantile(v, 0.1).toFixed(2), p25_pct: +quantile(v, 0.25).toFixed(2),
      p75_pct: +quantile(v, 0.75).toFixed(2), p90_pct: +quantile(v, 0.9).toFixed(2),
      share_positive_pct: +(100 * v.filter((x) => x > 0).length / v.length).toFixed(1),
      min_pct: +Math.min(...v).toFixed(2), max_pct: +Math.max(...v).toFixed(2),
    });
  }
}

const spikes2026 = episodes.filter((e) => e.date.startsWith('2026'));

const csv = (rows) => {
  if (!rows.length) return '';
  const keys = Object.keys(rows[0]);
  return [keys.join(','), ...rows.map((r) => keys.map((k) => r[k]).join(','))].join('\n') + '\n';
};

await mkdir(new URL('data/', root), { recursive: true });
const fetchedAt = new Date().toISOString();
await writeFile(new URL('data/episodes_vix_spikes.csv', root), csv(episodes));
await writeFile(new URL('data/vol_compression_break_episodes.csv', root), csv(volBreak));
await writeFile(new URL('data/summary_statistics.csv', root), csv(summary));
await writeFile(new URL('data/spikes_2026.csv', root), csv(spikes2026));
await writeFile(new URL('data/provenance.json', root), JSON.stringify({
  fetchedAt, window: { start: START, end: END }, endpoint: Object.keys(SYMBOLS).map(ENDPOINT),
  filter: {
    episodes: 'VIX one-day change >= +15% AND VIX close >= 18',
    vol_compression_break: 'VIX five sessions earlier <= 16.5 AND VIX one-day change >= +20% (no level floor; independent of the episodes filter)',
  },
  note: 'Derived statistics only; upstream daily prices are not redistributed.',
}, null, 2));

// Self-check against the figures published in the accompanying article.
const expect = (label, actual, want, tol = 0.06) => {
  const ok = Math.abs(actual - want) <= tol;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}: got ${actual}, published ${want}`);
  return ok;
};
const g = (name, metric) => { const row = summary.find((s) => s.group === name && s.metric === metric); return row ? row.median_pct : NaN; };
console.log(`\nepisodes matching the filter: ${episodes.length} | with a complete 21-session window: ${withWindow.length} (article quotes 167)  | vol-compression-break: ${volBreak.length} (article quotes 52)`);
let ok = expect('all / SPX fwd21 median', g('all', 'spx_fwd21_pct'), 1.89);
ok &= expect('all / SPX fwd5 median', g('all', 'spx_fwd5_pct'), 0.93);
ok &= expect('vix_18_to_22 / SPX fwd5 median', g('vix_18_to_22', 'spx_fwd5_pct'), 0.74);
ok &= expect('stays elevated / SPX fwd21 median', g('vix_stays_elevated', 'spx_fwd21_pct'), -2.17);
ok &= expect('fades / SPX fwd21 median', g('vix_fades', 'spx_fwd21_pct'), 2.99);
ok &= expect('vol break / SPX fwd21 median', g('vol_compression_break', 'spx_fwd21_pct'), 2.05);
ok &= expect('vol break / SPX fwd5 median', g('vol_compression_break', 'spx_fwd5_pct'), 0.65);
ok &= expect('vol break / SPX fwd10 median', g('vol_compression_break', 'spx_fwd10_pct'), 1.73);
ok &= expect('vol break / NDX fwd21 median', g('vol_compression_break', 'ndx_fwd21_pct'), 2.33);
ok &= expect('vix_18_to_22 / SPX fwd5 P10', (() => { const v = numeric(groups.vix_18_to_22, 'spx_fwd5_pct'); return +quantile(v, 0.1).toFixed(2); })(), -2.4);
console.log(`2026 spikes listed: ${spikes2026.length} (article table shows 6, i.e. only spikes inside the filter)`);
console.log(ok ? '\nSelf-check: all published figures reproduce.' : '\nSelf-check: MISMATCH - upstream data may have been revised; update the article.');
process.exit(ok ? 0 : 1);
