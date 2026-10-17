# What happens after a VIX spike: base rates, 2006–2026

Derived statistics for every session in which the Cboe VIX rose sharply in one day,
and what the S&P 500, Nasdaq and Philadelphia Semiconductor index did afterwards.

Companion article: https://www.parisberries.com/en/articles/vix-spike-oct-2026/
(Chinese: https://www.parisberries.com/zh-hans/articles/vix-spike-oct-2026/)

## Why this exists

On 16 October 2026 the VIX closed at 19.99 after a **+21.4% single-session move** and
**+34.7% over five sessions**. The level itself is ordinary (about the 65th percentile
since October 2006); the shock was the rate of change (98th percentile). Public commentary
reached confident predictions in both directions from a base rate nobody had computed.
This repository publishes the base rate instead.

## The result that matters

Averaging all episodes hides the split that decides the outcome. Grouping the same
episodes by whether VIX was still at or above the spike-day close five sessions later:

| Five sessions after the spike | Episodes | Median S&P 500 return at 21 sessions | Share higher |
|---|---:|---:|---:|
| VIX still elevated | 47 | **−2.17%** | 32% |
| VIX faded below the spike-day close | 120 | **+2.99%** | 75% |

The five deepest outcomes all sit in the "still elevated" branch. So the honest statement
about the following week is **conditional**, not a single number.

Unconditional medians, for comparison: +0.93% at 5 sessions, +1.47% at 10, +1.89% at 21,
with 63% of episodes higher after 21 sessions.

## Sample definitions

Two filter families, both computed on daily closes:

1. **Spikes** — VIX one-day change ≥ +15% **and** VIX close ≥ 18.
   168 sessions match; **167** have a complete 21-session forward window (the 2026-10-16
   spike is inside the sample but has no forward data yet, so the article quotes 167).
2. **Volatility-compression break** — VIX five sessions earlier ≤ 16.5 **and** one-day
   change ≥ +20%, with no floor on the VIX level. This is an **independent** family, not a
   subset of (1): 52 episodes, median +0.65% / +1.73% / +2.05% (S&P 500 at 5/10/21
   sessions) and +2.33% for the Nasdaq at 21 sessions.

Sample window: 17 October 2006 to 16 October 2026. Group counts and every published
figure are checked by `scripts/fetch-and-analyze.mjs`, which prints `PASS`/`FAIL` per
figure. Quantiles are nearest-rank; the article rounds some of them.

## Reproduce it

Requires Node.js 18 or newer. No dependencies.

```bash
node scripts/fetch-and-analyze.mjs
```

The script fetches daily closes, rebuilds every CSV in `data/`, and re-checks the numbers
quoted in the article. It exits non-zero if any figure no longer reproduces, so upstream
revisions become visible rather than silent.

## Files

| Path | Contents |
|---|---|
| `data/episodes_vix_spikes.csv` | One row per spike session: VIX close and jump, index moves on the day, forward returns at 5/10/21 sessions for S&P 500, Nasdaq and SOX, VIX five sessions later, and the `vix_stays_elevated_5d` branch flag |
| `data/summary_statistics.csv` | Per group and metric: n, median, P10, P25, P75, P90, share positive, min, max |
| `data/vol_compression_break_episodes.csv` | The second filter family, episode level |
| `data/spikes_2026.csv` | The six 2026 spikes used in the article's in-year table |
| `data/provenance.json` | Fetch timestamp, window, endpoints, filter definitions |

## Data licensing, please read before reusing

Daily closes come from the Yahoo Finance chart endpoint and are subject to that provider's
terms, which do not permit republication of the underlying price series. **This repository
distributes derived statistics only.** It deliberately contains no raw daily prices.

You may reuse the derived tables under CC BY 4.0 with attribution and a link back to this
repository and the article. If you need the price series, fetch it yourself from the
upstream provider under your own compliance with its terms — the script above does exactly
that.

## Limitations, stated plainly

- **Not a probability, not a forecast.** Medians over 167 overlapping episodes carry no
  independence assumption; episodes cluster (2008, 2020, March 2026). Treat the ranges as
  descriptive frequencies, not confidence intervals.
- **Conditional on the same regime.** A sample in which every prior outlier ends in a
  recovery can fail on an outlier this sample has never seen.
- **Survivorship of the index.** Forward returns are on index prices, not total return, and
  ignore costs, borrow and taxes.
- **Small sub-samples.** The SOX forward figures in the closest analogue class rest on about
  ten observations; `n_obs` is published precisely so this is visible.
- **The branch variable is only known with hindsight.** `vix_stays_elevated_5d` separates
  outcomes that look identical at the moment of the spike. That is the point of the result,
  and also its practical limit.

## Licence

- Code in `scripts/`: MIT (see `LICENSE-code`).
- Derived data in `data/`: CC BY 4.0 (see `LICENSE-data`), subject to the redistribution
  note above.
