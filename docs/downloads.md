# Скачивание приложений (Android APK / Windows .exe / macOS .dmg / iPhone)

Страница входа (`/`) и меню профиля показывают кнопки «Скачать приложение». На странице входа плитки цветные и крупные
(`DownloadAppsBlock`, `src/components/shared/DownloadApps.tsx`; значки `PlatformIcons.tsx` в режиме `colored`), в меню профиля значки
одноцветные. Ссылка «Установить приложение» (PWA) с лендингов убрана, она осталась в меню профиля (`Header`).

**Два сайта — два набора файлов.** `fomo.spot` отдаёт `FOMO.*`, `terminal.fomo.spot` (SITE_MODE=terminal) — свои `FOMO-Terminal.*`
через тот же блок (`flavor="terminal"`, плитки: Android, Windows, macOS; iPhone-плитки у терминала нет). Видимость плитки:

- `fomo.spot`: Android и Windows показываются всегда, macOS — только если в `public/app/dl-info.json` есть запись `macos`;
- `terminal.fomo.spot`: Android всегда; Windows и macOS — только если есть запись `terminal.windows` / `terminal.macos`.

Нет файла — нет записи — нет плитки: фальшивых ссылок не бывает. Запись пишет только `scripts/publish-downloads.ps1`, когда
файл лежит в папке-источнике.

| Платформа | Что отдаём | Ссылка на сайте (fomo.spot / terminal) |
|---|---|---|
| Android | подписанный APK (`android/`, постоянный ключ) | `/app/dl/FOMO.apk` / `/app/dl/FOMO-Terminal.apk` |
| Windows | установщик NSIS (`desktop/`, **без подписи кода**) | `/app/dl/FOMO-Setup.exe` / `/app/dl/FOMO-Terminal-Setup.exe` |
| macOS | universal `.dmg` (`desktop/`, **без нотаризации**, ad-hoc подпись), **пока файла нет**, плитки нет; сборка: `desktop/README.md`, раздел «macOS» | `/app/dl/FOMO.dmg` / `/app/dl/FOMO-Terminal.dmg` |

| Платформа | Что отдаём | Ссылка на сайте |
|---|---|---|
| Android | подписанный APK (`android/`, постоянный ключ) | `/app/dl/FOMO.apk` |
| Windows | установщик NSIS (`desktop/`, **без подписи кода**) | `/app/dl/FOMO-Setup.exe` |
| iPhone (только fomo.spot) | **файла нет**: `.ipa` без Mac и Apple Developer аккаунта собрать нельзя. Кнопка открывает окно «Как установить на iPhone»: Safari → «Поделиться» → «На экран «Домой»» | — |

Внутри Android-приложения (`FomoApp/`) и Windows-приложения (`FomoDesktop/`) блок скрыт.

## Откуда берутся файлы

Бинарники **не лежат в основной ветке** (`public/app/dl/` в `.gitignore`): установщик Windows весит около 94 МБ, а в
историю репозитория такое складывать нельзя. Они публикуются в отдельную ветку `downloads` одним коммитом без
истории (orphan, `push --force`), сервер забирает её содержимое в `public/app/dl/`.

Папка-источник на машине разработчика — `C:\Users\viptd\tools\downloads\`, только эти файлы (macOS-файлы необязательные):

- `FOMO.apk` — APK из `android/` (`C:\Users\viptd\tools\build-fomo.ps1 assembleRelease`, ключ из `tools\keys` — его не трогаем);
- `FOMO-Setup.exe` — установщик из `desktop/` (`npm run dist`, `FOMO-Setup-<версия>.exe`, переименованный; см. `desktop/README.md`);
- `FOMO-Terminal.apk` — `assembleTerminalRelease` (см. `docs/terminal-instance.md`);
- `FOMO-Terminal-Setup.exe` — установщик FOMO Terminal (`npm run dist:terminal`, переименованный);
- `FOMO.dmg`, `FOMO-Terminal.dmg` — macOS, необязательно (GitHub Actions «Desktop macOS» или сборка на Mac);
- `manifest.json` — `{ android: {file, version, versionCode, size, sha256}, windows: {...}, macos?: {...}, terminal: { android, windows, macos? }, updated }`.

## Как опубликовать

```powershell
cd "C:\Users\viptd\OneDrive\Документы\Блог\pulse"
# 1. пересчитать размеры и sha256 в manifest.json (версии указать, если они изменились)
scripts\publish-downloads.ps1 -RefreshManifest -AndroidVersion 1.0.0 -AndroidVersionCode 1 -WindowsVersion 1.0.0 `
  -TerminalAndroidVersion 1.0.0 -TerminalAndroidVersionCode 1 -TerminalWindowsVersion 1.0.0 -Dry
# при появлении .dmg добавить -MacVersion 1.0.0 -TerminalMacVersion 1.0.0; версии, которые не менялись, берутся из старого manifest.json
# 2. проверка без отправки (-Dry): сверяет manifest с файлами, готовит коммит во временном репозитории
scripts\publish-downloads.ps1 -Dry
# 3. отправка: временный репозиторий C:\Users\viptd\tools\downloads-repo, ветка downloads, git push --force
scripts\publish-downloads.ps1
```

Скрипт:

1. проверяет, что в папке только нужные файлы, а `manifest.json` совпадает с ними (размер, sha256), и что файлы
   меньше лимита GitHub. `.dmg` больше лимита в ветку **не кладётся**: скрипт печатает команду `scp` (на сервер в `public/app/dl/`; сделайте это ДО выкладки сайта, плитка появится из `dl-info.json`);
2. переписывает `public/app/dl-info.json` (версии и размеры, которые сайт показывает под кнопками; **закоммитьте его в
   `master`** и выложите сайт — цифры на кнопках и сами плитки macOS / терминала берутся только оттуда);
3. создаёт временный git-репозиторий, один коммит, ветка `downloads`, и делает `git push --force origin downloads`.
   Старые коммиты ветки становятся недостижимыми, история бинарников не копится.

## Как положить файлы на сервер

Сервер: `/opt/fomo`, процесс под pm2, nginx перед ним. Команды (на сервере, из `/opt/fomo`):

```bash
cd /opt/fomo
git fetch origin downloads
mkdir -p public/app/dl
# вариант 1 (рекомендуется): распаковать ветку архивом, индекс основного репозитория не затрагивается
git archive origin/downloads | tar -x -C public/app/dl
# вариант 2 (то же самое через checkout): отдельный индекс, иначе checkout запишет FOMO.apk и др. в индекс основного репозитория
GIT_INDEX_FILE=/tmp/dl.index git --work-tree=/opt/fomo/public/app/dl checkout origin/downloads -- .
rm -f /tmp/dl.index

chmod 755 public/app/dl && chmod 644 public/app/dl/*
ls -l public/app/dl
sha256sum public/app/dl/*.apk public/app/dl/*.exe   # сверить с manifest.json
pm2 restart fomo   # имя процесса — как в вашем деплое
```

> Команда `git --work-tree=… checkout origin/downloads -- .` без отдельного индекса добавит файлы в индекс
> основного репозитория (`git status` покажет `FOMO.apk` и т. д. в корне как «new file»), а следующий `git commit -a`
> или merge их подхватит. Поэтому выше — `git archive` или `GIT_INDEX_FILE`.

**Перезапуск сайта нужен**: Next.js (`server.ts` / `next start`) собирает список файлов из `public/` при старте,
поэтому новый файл, добавленный в уже работающий сервер, отдаётся с 404 до рестарта. Достаточно `pm2 restart` без
пересборки; обновление файла с тем же именем рестарта не требует, но браузеры и nginx могут держать кэш.
Папка `public/app/dl/` в `.gitignore`, поэтому `git pull` и сборка (`npm run build`, swap-deploy каталога `.next`)
её не трогают. Только `git clean -fdx` её сотрёт: после такой очистки команды выше нужно повторить.

## MIME-типы и nginx

- Next.js отдаёт файлы из `public/` с типом по расширению: `.apk` — `application/vnd.android.package-archive`,
  `.exe` — `application/x-msdownload` (оба скачиваются, а не открываются; имя файла задаёт атрибут `download` на ссылке).
- Если nginx отдаёт `/app/dl/` сам (быстрее для 94 МБ и поддерживает докачку), добавьте в сервер-блок:

```nginx
location /app/dl/ {
    alias /opt/fomo/public/app/dl/;
    types {
        application/vnd.android.package-archive apk;
        application/octet-stream exe;
        application/json json;
    }
    default_type application/octet-stream;
    add_header Cache-Control "public, max-age=300";
    add_header X-Content-Type-Options nosniff;
    access_log off;
}
```

  После правки: `nginx -t && systemctl reload nginx`. В этом варианте перезапуск pm2 не нужен: nginx читает папку напрямую.
- Android-приложение обновляется по `https://fomo.spot/app/version.json` (`url: https://fomo.spot/app/fomo.apk`) — это отдельный
  механизм и **другой путь**, он не менялся; кнопка скачивания на сайте ведёт на `/app/dl/FOMO.apk`.
  Хотите один файл — поменяйте `url` в `public/app/version.json` на `https://fomo.spot/app/dl/FOMO.apk`.

## Что показывает сайт

- Блок на странице входа: цветные плитки Android / Windows / macOS (если есть файл) / iPhone, подпись «Android · APK», «Windows · .exe», «macOS · .dmg», «iPhone · iOS»,
  версия и размер из `public/app/dl-info.json` (если запись некорректна, цифр нет — неверных чисел не бывает),
  подсказки («Разрешите установку из этого источника», «Установщик без подписи…»). Платформа посетителя определяется по
  `navigator.userAgent` после монтирования, она идёт первой и получает зелёную рамку.
- Строка «Скачать приложение» с одноцветными иконками-ссылками (macOS, когда есть файл): меню профиля в шапке (десктоп и мобильное меню) и
  экран профиля в интерфейсе приложения (вкладка «Профиль» и экран «Приложение», `src/components/app/profile`, вариант `profile` строки; в шапке приложения профиля больше нет).
- Проверка помощников (платформа, размеры, `FomoDesktop/`): `npx tsx scripts/check-downloads.ts`.

## Проверка после выкладки

```bash
curl -sI https://fomo.spot/app/dl/FOMO.apk | head -5          # 200, application/vnd.android.package-archive, Content-Length 1596856 (для 1.0.0)
curl -sI https://fomo.spot/app/dl/FOMO-Setup.exe | head -5    # 200, Content-Length как в manifest.json
curl -sI https://terminal.fomo.spot/app/dl/FOMO-Terminal-Setup.exe | head -5   # 200 (на сервере терминала папка /opt/fomo-terminal/public/app/dl/)
```

## Service worker и скачивание

`public/sw.js` не трогает `/app/dl/*`: ссылка `<a download>` это навигация, и иначе воркер клонировал бы 94-мегабайтный установщик в кэш.
После выкладки старые воркеры обновятся сами (файл изменился).
