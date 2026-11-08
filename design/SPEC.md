# Terminal redesign (Claude Design handoff "FOMO Terminal Desktop v3")

Source of truth: `design/FOMO Terminal Desktop v3.dc.html` (+ `design/support.js`, the Claude Design runtime).
`design/current-terminal-reference.png` = the CURRENT production terminal the design was drawn on top of
(same features: drawings, indicators, volume profile, Elliott, CVD, RSI, right panel with calendar).
The design is a visual refresh of the terminal chrome, plus a few new surfaces. Read the .dc.html top to bottom
(it is ~80 KB of HTML + an inline `x-dc` script: state, components, mock data) before touching code.
Do NOT copy its structure; recreate the look pixel-faithfully in the existing React/Tailwind components.

## Design language ("iOS-like floating cards")
- Page canvas `#F2F2F7`; panels/toolbars are WHITE rounded cards floating on the canvas with a small gap (no hard borders between regions).
- Radii: cards/panels 16, popovers/dialogs 12–16, buttons/inputs 7–10, pills 999. Hairlines `#E9E9EE` / `#F0F0F4` / `#E5E5EA`.
- Text: primary `#1C1C1E`, secondary `#3C3C43`, muted `#8E8E93`, placeholder `#8E8E93`.
- Accent green `#17804D` (hover `#0F6038`), logo up `#1E9E4A` / down `#E5322D`; blue `#0A84FF`, orange `#FF9F0A`, red `#FF3B30`/`#E5322D`, purple `#AF52DE`/`#8E5CF7`, teal `#00B8A9`, pink `#D63AA8`/`#E0457B`.
- Shadows: popover `0 12px 40px rgba(0,0,0,.18), 0 0 0 .5px rgba(0,0,0,.1)`; small `0 2px 12px rgba(0,0,0,.1)`; tiny `0 2px 4px rgba(0,0,0,.25)`.
- Font: `-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', Helvetica, Arial, sans-serif`; sizes 11–15 px (mostly 12/13/14). Hidden scrollbars (`::-webkit-scrollbar{width:0;height:0}`) inside terminal panels.
- Dark theme: the design is light only. Keep the site's dark mode working: derive dark tokens in the same spirit (canvas `#000`/`#0B0B0E`, cards `#1C1C1E`, hairlines `#2C2C2E`, text `#F2F2F7`, muted `#8E8E93`, same accents). Never regress dark.

## Surfaces seen in the design (screens captured at 1600x900)
1. Left vertical drawing toolbar (white card, icon column: cursor "+", trend line, horizontal line, fib/levels, rectangle, brush, text, ruler, star favourites, magnet, pencil, lock, eye, trash). Active tool = green filled square.
2. Top toolbar card: symbol chip (green circle logo + ticker + exchange + search icon), timeframe pills (1м 5м 15м **1ч** 4ч Д Н М + dropdown), chart-type button, «Сравнить», «Индикаторы» with count badge, «Оповещения», layout button, «Симулятор рынка» (replay), undo/redo, then right side: settings (gear), fullscreen, screenshot (camera).
3. Chart card: OHLC legend line ("Сбербанк · 1ч  O H L C  Vol"), collapsible «Индикаторы ( 10 )» legend, yellow value labels, price-axis labels as coloured rounded tags (green/red/blue/purple), Elliott note + volume-profile stats tooltip (white floating cards, small text), sub-panes (CVD, RSI) with eye/close icons.
4. «Индикаторы» popover (white, 12px radius, shadow): title "ИНДИКАТОРЫ", rows = colour dot + name + muted description + green iOS toggle (SMA 20/50/200, VWAP, ZigZag, Волны Эллиотта, Канал регрессии, Объёмный профиль, Объёмы, CVD, RSI 14).
5. «Сравнить» popover: "СРАВНИТЬ С", list of symbols (name + muted subtitle, green dot).
6. «Симулятор рынка»: dark pill at the bottom of the chart: "Симулятор · осталось 40 | Пуск | Шаг | Выход".
7. Bottom bar of the chart card: zoom controls (− + » ↻), range pills (1Д 5Д 1М 3М 6М YTD 1Г 5Л Все), «К дате», clock "19:05:05 UTC+3", «%», «Лог», «Авто» (green when on).
8. Right icon rail (narrow white card, 6 icons) + a ~240 px side panel card that opens per icon: СПИСОК НАБЛЮДЕНИЯ (rows: ticker, name·exchange, price, % change, mini sparkline), СВЕДЕНИЯ (key/value list), ИДЕИ (card linking to the site's ideas), КАЛЕНДАРЬ СОБЫТИЙ (range pills Вчера/Сегодня/Завтра/Неделя/След., country select, chips RU/US/Нефть и газ/Мосбиржа, search, events with time, flag, title, fact/forecast/prev), ОБЪЕКТЫ (indicators list with «скрыть»/× + drawings), ОПОВЕЩЕНИЯ ("+ Создать", "Изменить", rows with toggles).
9. Footer line in the panel: "Источник: TradingView · Мосбиржа. Не является инвестиционной рекомендацией."

## Mapping to the codebase (do not rewrite behaviour — restyle)
- Terminal page: `src/app/(main)/terminal/page.tsx`; chart shell `src/components/chart/TradingChart.tsx`.
- Top toolbar `TopToolbar.tsx`, bottom range bar + zoom (inside TradingChart / related), legend `IndicatorLegend.tsx`, replay `ReplayControls.tsx` (= «Симулятор рынка»).
- Left toolbar `DrawingToolbar.tsx` (+ `DrawingControls.tsx`, `DrawingStyleBar.tsx`, icons in `icons*.tsx`).
- Right rail + panels `RightPanel.tsx` (tabs watchlist/info/news/calendar/objects/orderbook/algo), `MarketRows.tsx`, `ObjectTree.tsx`, `OrderBookPanel.tsx`, `AlgoPanel.tsx`, `calendar/CalendarPanel.tsx`, `AlertsDialog.tsx`.
- Popovers/dialogs: `IndicatorsDialog.tsx`, `SymbolSearch.tsx`, `ContractPicker.tsx`, `ChartSettingsDialog.tsx`, `DrawingSettingsDialog.tsx`, `IndicatorSettingsDialog.tsx`, `ChartContextMenu.tsx`.
- Chart canvas colours: `src/lib/chart/settings.ts` / engine theme (light theme colours should match the design: white canvas inside the card, soft grid, green `#1E9E4A` / red `#E5322D` candles, tag-style price labels).

## Rules for all implementers
- Keep ALL existing functionality, hotkeys, i18n (ru/en/cn via useT; add keys, never hardcode Russian), guest teaser (blurred chart + lock card), mobile layout, dark mode.
- Features in the design that don't exist yet may be added only if cheap (e.g. the compact indicators popover); otherwise leave a note.
- Don't render the design in a browser unless needed; everything is spelled out in the source. For your own UI verification you may run the project dev server if it starts without a database; otherwise rely on `npx tsc --noEmit -p .` and careful reading.
- Windows gotcha: never write regex backslashes (`\b` …) inside non-raw Python strings when patching files (they become backspace chars); prefer the Edit tool; afterwards `grep -c $'\b' <file>` must be 0.
- Commit only your own files with explicit `git add <paths>` (untracked junk that must never be added: `.env.env.backup-2026-07-31`, `_frames/`, `docs/faq.md`, `out2.json`). Message ends with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Before pushing run `git pull --rebase origin master` (other agents push in parallel), then `git push origin master`. No deploy.
