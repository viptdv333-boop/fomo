# Координация агентов (Hermes ↔ Codex)

Общий репо `pulse` (fomo.spot / terminal.fomo.spot). Этот файл — асинхронная сверка, чтобы не конфликтовать и не дублировать. Обновлён Hermes.

## Что уже в origin/master и ждёт деплоя (очередь ~15 коммитов)

### Hermes (данные + логика, коммиты изолированы от WIP Codex):
- `5873bee` + `58d5693` — **фильтр стран: единый список из 8 утверждённых** `RU, US, CN, HK, JP, GB, DE, IN` во ВСЕХ категориях (`src/lib/instrument-filters.ts`, `ALL_COUNTRIES`). Убраны 12 пустых стран + AU/KR/TW/BR. **Не возвращать удалённые страны в фильтр** — это решение пользователя.
- `31fc140` — карта биржа→страна (`src/lib/yahoo-search.ts`, `VENUE`): добавлены биржи индексов (SNP/DJI/NYSE/CBO/NYB/STOXX/BSP) и US-фьючерсов (CME/CMX/NYM/CBT/ICE). США теперь 7 индексов + фьючерсы. **Дополняет** твой `61d9a2d` (full market coverage), не дубль.
- `d7c250a` — watchlist: закреплённые всегда вверху (`RightPanel.tsx`, сортировка `shown` по `wl.pinned` + маппинг drag-индексов `moveRow`).
- `4e801dd` — **метки роллов на графике**: новый `src/lib/chart/roll-markers-layer.ts` (`RollMarkersLayer`, по образцу `EventsLayer`) + endpoint `src/app/api/continuous-rolls/route.ts` + `chainRolls` в `continuous-futures.ts`. Интеграция в `TradingChart.tsx` (import/useState/attach/detach/3 effect). Ключ i18n `cs.rollMark` (ru/en/zh).

### Codex (UI): иконки T-Invest (`de876b9`, `09a5bd7`, `fb701d9`), баннер FOMO Spot (`6be887e`→`2721b36`), селектор рынка (`6d8909c`), full coverage (`61d9a2d`), general chat (`bd9efa6`).

## Просьбы к Codex
1. **Проверь, что твой UI рендерит данные Hermes:** слой меток роллов (`RollMarkersLayer` уже приаттачен в `TradingChart`), фильтр стран (8), сортировку закреплённых. Если твой рефактор `TradingChart`/`RightPanel`/`ChartSettingsDialog` перезаписал эти места — восстанови интеграцию (см. коммиты выше).
2. **Настройка back-adjust:** чекбокс «Корректировать с учётом изменений контрактов» в новом диалоге привяжи к `prefs.backAdjust` (функциональность готова: `backadjust=1` → `buildContinuous` сдвигает сегменты). Сейчас в `ChartSettingsDialog` привязки нет.
3. **Не дублируй:** метки роллов, фильтр стран, пин-сортировка, карта бирж уже сделаны Hermes. Иконки/баннер/селектор — твоя зона, Hermes их не трогает.
4. **Тест-файл `scripts/check-instrument-search.ts`:** ожидание списка стран обновлено под 8 стран (порядок `RU, US, CN, DE, GB, HK, IN, JP` — после РФ/США алфавит). Если правишь этот тест — сохрани это ожидание.

## Изоляция
Hermes коммитит только свои файлы по явным путям; WIP Codex сохраняется (diff → reset к origin → коммит своего → `git apply` WIP обратно). Чужие staged-файлы не sweeping.

## Деплой — протокол «не затирать друг друга» (ОБЯЗАТЕЛЬНО для обоих агентов)
1. **Единый источник правды — `origin/master`.** Каждый агент коммитит и пушит СВОИ правки в origin перед деплоем. Не держать незапушенный серверный код.
2. **Деплой только `git fetch + merge/pull origin`** (или reset к origin ПОСЛЕ того, как своя работа запушена). **ЗАПРЕЩЕНЫ** tar-распаковка поверх `/opt/fomo` и `reset --hard` к локальной divergent-копии — они затирают чужие уже-запушенные правки (кнопка возле тикера, страны, иконки, баннер).
3. Перед деплоем: `git pull --rebase origin master`, решить конфликты объединением (обе правки), запушить, затем собрать из origin. live-билд должен равняться origin HEAD.
4. Одна сборка за раз (MemoryMax=10G, MemorySwapMax=0), ждать чужую сборку, не запускать вторую параллельно (swap-фриз).
5. Гейт у пользователя. Окно 00:00–07:00 MSK. Проверять `X-Fomo-Build` == origin HEAD, не source HEAD.
6. Если live-билд ≠ origin HEAD — значит кто-то задеплоил divergent-копию; пересобрать из origin, чтобы вернуть ОБА набора правок.