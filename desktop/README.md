# FOMO для Windows и macOS (Electron)

Тонкое десктоп-приложение: окно Electron, которое открывает <https://fomo.spot>. Сайт один и тот же, поэтому
новые функции появляются в приложении сразу после деплоя сайта — переустанавливать ничего не нужно.

Папка `desktop/` живёт отдельно от сайта: свой `package.json`, в сборку Next.js и в TypeScript-проект сайта не входит
(в ней только `.js`, а `node_modules` TypeScript пропускает сам).

## Два приложения из одной папки (flavor)

| | `main` (по умолчанию) | `terminal` |
|---|---|---|
| Название | FOMO | FOMO Terminal |
| Сайт | <https://fomo.spot> | <https://terminal.fomo.spot> |
| Установщик Windows | `FOMO-Setup-<версия>.exe` → на сайте `FOMO-Setup.exe` | `FOMO-Terminal-Setup-<версия>.exe` → `FOMO-Terminal-Setup.exe` |
| macOS | `FOMO-<версия>-mac.dmg` → `FOMO.dmg` | `FOMO-Terminal-<версия>-mac.dmg` → `FOMO-Terminal.dmg` |
| appId | `spot.fomo.desktop` | `spot.fomo.terminal.desktop` |
| Профиль (cookie, вход, размер окна) | `%APPDATA%\FOMO` | `%APPDATA%\FOMO Terminal` |
| Иконка | `build/icon.ico`, `assets/icon.png` | `build/icon-terminal.ico`, `assets/icon-terminal.png` (из `public/icons-terminal/icon-512.png`) |
| Папка сборки (Windows) | `C:\Users\viptd\tools\desktop-out` | `C:\Users\viptd\tools\desktop-out-terminal` |

Параметры flavor лежат в `flavors.js`, конфиг сборки — `electron-builder.config.js` (flavor берётся из переменной `FLAVOR`;
`build/dist.js` выставляет её сам, поэтому работает в PowerShell, cmd и bash). В собранный `package.json` попадает
`fomoFlavor`, по нему `main.js` выбирает сайт и профиль. У каждого приложения свой профиль и своя блокировка «один
экземпляр», поэтому они ставятся рядом и сессии не смешиваются. Обычный запуск для разработки: `npm start` (main) и
`npm run start:terminal`.

## Что делает

- Окно «FOMO» (во flavor terminal — «FOMO Terminal») с тёмным фоном `#0a0a0a`, минимум 400×600. Размер, положение и масштаб запоминаются в
  `%APPDATA%\FOMO\window-state.json`.
- Меню скрыто, стандартные клавиши работают: `Ctrl+R` / `F5` — обновить, `Ctrl+Shift+R` — обновить без кэша,
  `F11` — полный экран, `Ctrl` + `+` / `-` / `0` — масштаб, `Alt+←` / `Alt+→` — назад / вперёд.
  Правый клик: копировать / вставить в полях ввода.
- Один экземпляр: второй запуск просто выводит первое окно на передний план.
- В окне остаётся только `https://fomo.spot` (и `www.fomo.spot`). Любая другая ссылка, в том числе `window.open`,
  открывается в браузере по умолчанию; наружу уходят только `https:` и `mailto:`.
- Безопасность: `contextIsolation`, `sandbox`, `nodeIntegration` выключен, `<webview>` запрещён, DevTools выключены
  (включаются флагом `--devtools`).
- Разрешения сайта: уведомления, чтение буфера обмена, камера/микрофон (`media`) и полноэкранный режим (график) —
  только для `fomo.spot`. Всё остальное запрещено.
- User-Agent получает хвост ` FomoDesktop/<версия> Windows`: по нему сайт понимает, что открыт в приложении, и прячет
  кнопки «Установить приложение» и «Скачать приложение» (`isDesktopApp()` в `src/lib/native-app.ts`).
- Нет сети — вместо белого экрана показывается локальная страница `offline.html` с кнопкой «Повторить».

## Ограничения

- **Нет Web Push.** В Electron нет сервиса FCM, поэтому push при закрытом приложении не приходят. Работают
  уведомления самого сайта (системные уведомления Windows, пока приложение запущено) и звуки/счётчики на странице.
  Для уведомлений при закрытом приложении используйте Android-приложение или PWA в Chrome/Edge.
- **Установщик без подписи.** Сертификата подписи кода нет, поэтому Windows SmartScreen показывает «Неизвестный
  издатель». Это нормально для неподписанного установщика: «Подробнее» → «Выполнить в любом случае».
- Автообновления нет (см. «Как обновить»).
- Windows: только x64. Linux не собирается.
- macOS: см. раздел «macOS» ниже. На Windows `.dmg` собрать нельзя: нужен Mac или GitHub Actions.

## Как собрать (Windows)

Нужны Node.js 20+ (проверено на 24) и интернет (скачиваются Electron и инструменты NSIS).

Путь репозитория содержит кириллицу, а `electron-builder` и NSIS на таких путях ведут себя нестабильно, поэтому
собирайте из ASCII-копии (так же, как `C:\Users\viptd\tools\build-fomo.ps1` делает для Android):

```powershell
$src = "C:\Users\viptd\OneDrive\Документы\Блог\pulse\desktop"
$dst = "C:\Users\viptd\tools\fomo-desktop"
robocopy $src $dst /MIR /XD node_modules dist /NFL /NDL /NJH /NJS /NP
cd $dst
npm install
npm run dist            # FOMO          -> C:\Users\viptd\tools\desktop-out\FOMO-Setup-<версия>.exe
npm run dist:terminal   # FOMO Terminal -> C:\Users\viptd\tools\desktop-out-terminal\FOMO-Terminal-Setup-<версия>.exe
```

Папка вне репозитория (`DESKTOP_OUT=<папка>` меняет её). Параметры сборки — `electron-builder.config.js`: NSIS без «в один клик»
(можно выбрать папку), установка для текущего пользователя, ярлыки на рабочем столе и в меню «Пуск», сжатие
`maximum`, языки Chromium только `ru`, `en-US`, `zh-CN`.

`build/after-pack.js` удаляет из Electron файлы WebGPU/Vulkan (`dxcompiler.dll`, `dxil.dll`, `vk_swiftshader.dll`,
`vulkan-1.dll`): сайт их не использует (графики рисуются на canvas 2D), а установщик иначе не помещается в лимит
GitHub в 100 МБ. Размер установщика 1.0.0 — около 94 МБ (FOMO Terminal — 94,3 МБ); следите, чтобы он оставался меньше 95 МБ.

Иконка `build/icon.ico` (16–256 px) сделана из `public/icon-512.png` через Pillow:

```python
from PIL import Image
Image.open("public/icon-512.png").convert("RGBA").save(
    "desktop/build/icon.ico", sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)])
```

## macOS

`npm run dist:mac` и `npm run dist:mac:terminal` собирают **universal** (Apple Silicon + Intel) `.dmg` и `.zip`. Собирать нужно
на Mac: `.dmg` на Windows не получить. Варианты:

1. **GitHub Actions** (рекомендуется): `.github/workflows/desktop-mac.yml`. На странице репозитория Actions → «Desktop macOS» →
   Run workflow. Через ~10 минут в запуске появятся артефакты `fomo-mac` и `fomo-terminal-mac` (внутри `site/FOMO.dmg` и
   `site/FOMO-Terminal.dmg`, уже под именами для сайта). Файл workflow пушится токеном со scope `workflow`.
2. На своём Mac: `cd desktop && npm install && npm run dist:mac` (результат в `desktop/dist/<flavor>/`, переименовать в `FOMO.dmg` /
   `FOMO-Terminal.dmg`).

Чтобы плитка macOS появилась на сайтах: положить `.dmg` в `C:\Users\viptd\tools\downloads` и выполнить
`scripts\publish-downloads.ps1 -RefreshManifest -MacVersion 1.0.0 -TerminalMacVersion 1.0.0 -Dry` (см. `docs/downloads.md`). Без файла
записи `macos` в `dl-info.json` нет, и плитки нет.

**Подпись.** Сертификата разработчика Apple нет, поэтому приложение подписано только ad-hoc (`identity: "-"`: Apple Silicon не
запускает вовсе неподписанные) и **не нотаризовано**. При первом запуске macOS пишет «разработчик не определён»: правый клик по
приложению → «Открыть» → «Открыть» (на macOS 15+: «Системные настройки → Конфиденциальность и безопасность → Всё равно открыть»).
Если после скачивания в браузере пишет «повреждён»: `xattr -cr /Applications/FOMO.app`. Автообновления нет, как и на Windows.
Universal-`.dmg`, вероятно, больше 100 МБ: через ветку `downloads` (лимит GitHub) он не пройдёт, файл копируют на сервер `scp`
(скрипт публикации печатает команду). Меню macOS минимальное (приложение / правка / окно), горячие клавиши работают на `Cmd`.
Сборка macOS **ни разу не запускалась** (нет Mac): конфиг проверен только схемой electron-builder.

## Проверка

```powershell
npx electron --version            # версия Electron
npx electron . --smoke            # скрытое окно: грузит сайт, печатает OK / FAIL <причина> и выходит (до 15 с)
.\win-unpacked\FOMO.exe --smoke   # то же для собранной версии (в папке desktop-out; у terminal: "FOMO Terminal.exe" в desktop-out-terminal)
$env:FOMO_FLAVOR="terminal"; npx electron . --smoke   # dev-запуск smoke для flavor terminal
```

`--smoke` печатает также адрес и User-Agent; при `FOMO_SMOKE_OUT=<файл>` дублирует вывод в файл (у GUI-приложения
Windows нет консоли). Код выхода 0 — всё хорошо.

## Как обновить

1. Поднимите `version` в `desktop/package.json` (например, `1.0.1`; версия общая для обоих flavor) и пересоберите установщики (`dist`, `dist:terminal`).
2. Положите `FOMO-Setup-<версия>.exe` и `FOMO-Terminal-Setup-<версия>.exe` в `C:\Users\viptd\tools\downloads` как
   `FOMO-Setup.exe` и `FOMO-Terminal-Setup.exe`, обновите `manifest.json` и опубликуйте через `scripts/publish-downloads.ps1` (см. `docs/downloads.md`).
3. Пользователи скачивают новый установщик со страницы входа и ставят его поверх: настройки и окно сохраняются.

Содержимое самого сайта обновлять так не нужно: оно приходит с сервера.
