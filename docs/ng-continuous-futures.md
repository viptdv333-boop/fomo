# NG continuous futures (MOEX)

`NG1!` is the nearest dated NG contract; `NG2!` is the second nearest. Both roll on the calendar day **after the nearest contract's LSTTRADE** from MOEX ISS. The outgoing contract's complete last trading day is retained. This is an expiry-based schedule, not TradingView's volume-based schedule. No synthetic bars are inserted on weekends or days without trades.

The catalogue includes expired NG contracts; FRSTTRADE and LSTTRADE come from each security's description. The `NG` legacy alias continues to mean the current real contract. Exact symbols such as `NGZ6`, `NGF7` and expired contracts retain their own history and are selectable separately. Opening an expired NG contract anchors the initial history window to its last trading day; B-ADJ never changes its prices. The synthetic names are chart instruments, not exchange order symbols.

## B-ADJ

Off by default. The button appears at the bottom of a continuous chart (including the mobile chart) and is saved with chart preferences. For each completed roll, compute new close minus old close on the latest common daily candle on/before the outgoing front expiry. Add all subsequent roll differences to historical OHLC; keep volume and current-contract prices unchanged. NG2 differences use the same front expiry dates as NG1. Ordinary market gaps are preserved. Historical adjusted prices may be negative.

The adjustment anchor is today's chain, even when loading an old page. A missing common close is an error, never a silent unadjusted fallback. The chart reloads at the Moscow calendar rollover and when B-ADJ changes; live polling and history pagination use the selected mode. Continuous bars bypass persistent browser history caches to avoid stale adjustment anchors. Weekly/monthly/yearly candles are aggregated after stitching daily bars.

## Resources and failures

Metadata: six-hour cache and four concurrent catalogue workers. Public raw candle cache: at most 128 windows / 40,000 rows, ten-second lifetime for the current day and one hour for completed dates. Authenticated ALGOPACK rows are not put in the shared cache. Daily roll differences have their own small one-day cache. Independent historical contract windows and roll calculations use bounded workers. Every ISS page is checked; incomplete upstream responses return 502 and leave existing chart data intact. Continuous charts load older history on demand instead of downloading the entire series in the background.

## Local verification

```powershell
npx tsx scripts/check-ng-continuous.ts
npx tsx scripts/check-contracts.ts
npx tsx scripts/check-prefs-sanitize.ts
npx tsc --noEmit
# Optional read-only checks against ISS; configure ALGOPACK_CA_FILE if required by the environment.
npx tsx scripts/check-ng-continuous.ts --live
```

The live check verifies 45 daily bars for both ranks, the latest completed expiry, B-ADJ pagination, hourly and five-minute history against actual MOEX data. It uses closed days so forming bars cannot change between assertions. Implementation prepared locally; deployment requires the user's separate instruction.
