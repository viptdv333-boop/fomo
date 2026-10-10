# Tab host: instant dock tabs in the app UI

Code: `src/components/app/tabhost/` (`AppTabHost.tsx`, `store.ts`, `screens.ts`, `warm.ts`, `tabhost.css`), pure logic `src/lib/app-tabhost.ts`.
Checks: `npx tsx scripts/check-tabhost.ts`, `scripts/check-candle-cache.ts`, `scripts/check-sw-cache.ts`.

## What it does

Only in the app UI (`html.app-ui`: Android app, Windows app, `?appui=1` preview). The layout wraps `{children}` of `<main>` in `<AppTabHost>`.

* The roots of the dock tabs (`/feed /terminal /chat /calendar /channels /authors /profile`, any locale prefix, any query) are not rendered by Next's
  route tree any more: the host mounts the tab's **screen** (the same component the route page renders, loaded lazily) and keeps it mounted.
* Switching a tab = `history.pushState` in place (Next 15 follows it: `usePathname` / `useSearchParams` update, no server round trip) + showing the
  screen that is already there (`store.ts hostNavigate`). The dock, the swipe, the desktop keys, the Android Back handler (`goTo`), the logo and
  every `<a href>` to a tab root go through it.
* `/calculator` is a dock tab (right after the terminal, on the terminal site too) but **transient** like the terminal: it is released when left and mounts fresh each
  time, so its inputs come from the link (`?ticker=&entry=&from=terminal` of the terminal's card; with `?from=terminal` it is a pushed screen: no swipe, Back leads to the terminal).
* Hidden screens are React `<Activity mode="hidden">`: DOM and state stay, **effects are cleaned up** (timers, sockets, listeners, the `html.app-*-on`
  classes) and run again on show, which is also the silent refresh on return. Scroll position is kept per tab (the scroller is `<main>`).
* Anything that is not a tab root (an idea, a channel, an author, forms) stays an ordinary Next route; the kept
  screens wait hidden and come back instantly on Back (scroll kept).
* **Pre-mounting** (`warm.ts`): 3 s after start, in idle slots, the other tabs are mounted one by one in a `display:none` box, load their data,
  and are put to sleep (after the data has arrived, at most 7 s each). While a screen warms, a firewall strips the `html.app-*-on` classes it sets and
  makes `main.scrollTo` a no-op; the guest demo gate does not count it. A tap anywhere ends the warm-up at once. The code of all screens is fetched
  first (`screens.ts preloadScreens`).
* A thin refresh line (`.app-refresh-line`) shows while the screen on display has `/api` reads in flight for more than 350 ms. Never a spinner over content.
* The feed refreshes silently (on show and every 60 s). New posts wait behind a «Новое: N» pill when the reader has scrolled down or is touching
  the screen, and go in by themselves when the list is at its top.

## Which screens stay mounted

| screen | kept | why |
|---|---|---|
| Доска, Болталка, Календарь, Каналы, Авторы, Профиль | yes (LRU, budget by `navigator.deviceMemory`: ≤2 GB 3, ≤4 GB 4, more 6, unknown 5) | light lists |
| Терминал | **no** (mounted while shown, released when left) | holds a chart engine, canvases and live feeds: never two charts, nothing polls in the background. The chart opens from the stored candles (below) |
| Калькулятор | no | its inputs come from the link (`?ticker=..&entry=..`), a kept copy would show stale ones; it still opens in place (code preloaded) |

A link into a kept tab **with a query** that the screen reads only at mount (`/feed?instrumentId=7`) throws the kept copy away and mounts it again
(`needsFreshMount`). The chat and the profile follow the URL and keep their copy.

## Kill switch

* `?tabhost=0` in any URL (remembered in `localStorage fomo-tabhost=0`), `?tabhost=1` switches it on again and forgets it.
* Off = exactly the old behaviour: `<AppTabHost>` renders `{children}`, tabs are plain `router.push`.
* Also off outside the app UI and during hydration (server HTML is unchanged).

## Chart: stored candles and settings (`src/lib/chart/candle-cache.ts`)

* The chart paints from the last stored bars (IndexedDB `fomo-candles`, in-memory front) and the live answer replaces them as soon as it arrives; the live
  feed (`/api/quote` polling) starts only on live bars. Key = `source|TICKER|interval|bars`. At most 12 symbols and 8 MB, least recently used first.
  Only the initial answer (600 bars) is stored; scroll-back pages are not.
* Older than one bar and online: badge «Данные на HH:MM» until the live answer replaces it. Offline: «Нет сети — данные на HH:MM»; when the network
  returns, the live bars load by themselves.
* «Очистить сохранённые данные» (`clearSavedData`) wipes it with the service worker's caches. `/api/klines` and `/api/quote(s)` stay out of the worker's API cache.
* Chart settings, prefs, the last symbol: read from the local mirror synchronously in the first render. The terminal no longer waits up to 700 ms for the
  account when a symbol is stored on the device. Changes made offline stay queued and are pushed on the `online` event.

## The dictionary

`/i18n/<locale>-<hash>.js` (route `src/app/i18n/[file]/route.ts`, `dict-script.ts`) sets `self.__FOMO_I18N`; a blocking `<script>` in `<head>` loads it, the
service worker keeps it cache-first, `I18nProvider` reads it before hydration (on the server it reads the module). The HTML of a page lost ~280 KB.
`experimental.inlineCss` is left on (first-visit paint of the public site); switching it off would cut another ~330 KB from every document.

## Risks / things to know

* A different account (sign-in after browsing as a guest, sign-out) throws every kept screen away: they mount again with the new user's data.
* Effects of a screen run again on every show (refresh). A screen that resets its state in a mount effect would flash: the feed was fixed (silent
  refresh); the others keep their data.
* `Activity` is taken from the vendored React by its symbol (`Symbol.for("react.activity")`); a Next upgrade that changes it shows up as the host
  failing to mount: use the kill switch while fixing.
* A hidden Activity is not rendered at idle priority for context changes it does not need; memory is bounded by the budget above.
* Real-phone numbers are not measured (only a throttled desktop Chrome); see the task report.
