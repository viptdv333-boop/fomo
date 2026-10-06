# FOMO Terminal — отдельный инстанс terminal.fomo.spot

Тот же код, второй экземпляр: свой checkout (`/opt/fomo-terminal`), свой `.env`, **своя база PostgreSQL и свои пользователи**,
свой процесс pm2 (`fomo-terminal`) на другом порту, свой vhost nginx. С `fomo.spot` не общего ничего: ни базы, ни
`AUTH_SECRET`, ни cookie, ни ключей. Режим включается переменными окружения; если они не заданы, `fomo.spot` ведёт себя
ровно так же, как раньше.

В копии есть только: Терминал, Календарь, уведомления (колокольчик, push, Telegram, e-mail, Android), профиль
(вкладки «Профиль», «Безопасность», «Настройки уведомлений») и админка для владельца инстанса. Доски идей, чата, каналов,
авторов, калькулятора, платежей, подписок, комнат, справки нет.

## Как включается режим

| Переменная | Когда читается | Значение |
|---|---|---|
| `SITE_MODE=terminal` | во время работы (сервер, API, рассылка, метаданные) | включает режим |
| `NEXT_PUBLIC_SITE_MODE=terminal` | **при сборке** (клиентский код, middleware) | то же значение; после смены — пересборка |
| `NEXT_PUBLIC_SITE_URL=https://terminal.fomo.spot` | при сборке и во время работы | публичный адрес: canonical, sitemap, robots, письма, ссылки уведомлений |
| `AUTH_URL`, `NEXTAUTH_URL` = тот же адрес | во время работы | next-auth; по ним же решается, нужны ли `Secure`-cookie |
| `AUTH_SECRET`, `NEXTAUTH_SECRET` | во время работы | **свой** секрет инстанса (`openssl rand -base64 48`) |
| `AUTH_COOKIE_PREFIX` | необязательно | по умолчанию в режиме terminal — `terminal` |
| `EMAIL_FROM` | необязательно | иначе `FOMO Terminal <no-reply@fomo.spot>` |

Без `SITE_MODE` / `NEXT_PUBLIC_SITE_MODE` сайт — обычный fomo.spot (`siteUrl()` = `https://fomo.spot`, cookie
`authjs.*`, все страницы). Логика: `src/lib/site-mode.ts`, проверка: `npx tsx scripts/check-site-mode.ts`.

### Что делает режим terminal

- **Страницы — allowlist** (`routeAllowed`, middleware): `/`, `/login`, `/register`, `/forgot-password`, `/terminal*`,
  `/calendar*`, `/profile`, `/privacy`, `/terms`, `/admin`, `/admin/users`, `/admin/broadcast`, `/admin/site-settings`.
  Всё остальное (в т. ч. любые новые страницы) — редирект на `/terminal` (закрытые разделы админки — на `/admin`).
  `/` для гостя — лендинг «FOMO Terminal» (`TerminalLanding`), для вошедшего — редирект на `/terminal`.
- **API — тоже allowlist**: чужие маршруты отвечают `404 {"error":"Not found"}`. Проверка стоит в `server.ts` (видит все
  `/api/*`) и в middleware (дублирует для тех, что он видит). Открыты: `auth`, `captcha`, `terminal`, `calendar`,
  `economic-calendar`, `klines`, `quote(s)`, `market-search`, `contracts`, `orderbook`, `orderflow`, `algopack`, `news`,
  `notifications`, `notification-settings` (в т. ч. вебхуки ботов), `push`, `telegram`, `me`, `languages`, `site-settings`,
  `version`, `upload`, `socketio`, `users` и `users/<id>` (профиль и список для админа), `admin/stats|broadcast|site-settings`.
- **Админка** `/admin` доступна только ADMIN / OWNER (проверяет middleware), в меню сайта ссылки на неё нет; в самой админке
  оставлены разделы «Пользователи», «Рассылка», «Настройки сайта».
- **Cookie** сессии: `terminal.session-token` (по http) или `__Secure-terminal.session-token`, `__Secure-terminal.callback-url`,
  `__Host-terminal.csrf-token` (по https). Без `Domain` (только свой хост). Сессия fomo.spot (`authjs.*`, другой секрет) здесь не
  читается, и наоборот. Ни в одном месте кода нет общего cookie-домена.
- **Настройки уведомлений**: матрица показывает «Терминал и календарь» (price_alert, line_alert, calendar_reminder) и «Система».
  Социальные события и платежи скрыты.
- **Нижнее меню приложения (app UI)**: Терминал, Календарь, Профиль, Настройки.
- **Брендинг**: title/description «FOMO Terminal …», manifest «FOMO Terminal» (`start_url /terminal`, без share target),
  иконки `public/icons-terminal/*`, canonical и hreflang на `terminal.fomo.spot`, нет верификации Яндекса, нет Яндекс.Метрики и
  Google Analytics (счётчики fomo.spot), sitemap — только страницы терминала, без обращений к базе.
- **Socket.IO**: CORS только на адрес инстанса (на fomo.spot по-прежнему `*`).

## Что нужно сделать (по порядку)

### 0. Один раз: DNS
В панели Timeweb добавить запись **A** `terminal` → IP сервера (тот же, что у fomo.spot; AAAA — если у fomo.spot есть IPv6).
Проверка: `dig +short terminal.fomo.spot`.

### 1. Сервер: код, база, `.env`, сборка, pm2

```bash
sudo git clone https://github.com/viptdv333-boop/fomo.git /opt/fomo-terminal
sudo chown -R "$USER": /opt/fomo-terminal && cd /opt/fomo-terminal
bash scripts/terminal-instance-setup.sh all
```

`all` = `env` → `db` → `install` → `vapid` → `init` → `build` → `pm2` → `nginx` (печатает vhost). Каждый шаг можно запускать отдельно:

| Шаг | Что делает |
|---|---|
| `env` | создаёт `/opt/fomo-terminal/.env` (chmod 600): режим, адрес, `DATABASE_URL` с **сгенерированным** паролем, **новый** `AUTH_SECRET`; ключи — пустые. Существующий `.env` не трогает |
| `db` | от `postgres` создаёт роль `fomo_terminal` и базу `fomo_terminal` (идемпотентно) |
| `install` | `npm ci`, `prisma generate`, `prisma db push --skip-generate` (схема пустой базы целиком из `schema.prisma`) |
| `vapid` | генерирует VAPID-ключи web push для инстанса (публичный — переменная **сборки**) |
| `init` | языки, `SiteSettings` и **первый владелец** (см. ниже) |
| `build` | `npm run build` с `NEXT_PUBLIC_*` из `.env` |
| `pm2` | `ecosystem.terminal.config.cjs` (в корне checkout, в git не попадает), `pm2 start`, `pm2 save` |
| `nginx` | печатает vhost; `INSTALL_NGINX=1 bash … nginx` кладёт его в `sites-available` |
| `certbot` | `certbot --nginx -d terminal.fomo.spot` (`CERTBOT_EMAIL=… ` — необязательно) |

Те же команды руками (если не хочется скрипта):

```bash
# от postgres
sudo -u postgres psql -c "CREATE ROLE fomo_terminal LOGIN PASSWORD '<пароль из DATABASE_URL>';"
sudo -u postgres psql -c "CREATE DATABASE fomo_terminal OWNER fomo_terminal;"
# из /opt/fomo-terminal
npm ci && npx prisma generate && npx prisma db push --skip-generate
```

Порт по умолчанию `3100` (`PORT=… bash scripts/terminal-instance-setup.sh …` меняет и `.env`, и nginx, и pm2). `fomo.spot`
остаётся на своём порту под `/opt/fomo`.

### 2. Схема базы: `db push`, а не миграции
Миграции из `prisma/migrations` — идемпотентные SQL-патчи для **существующей** базы fomo.spot (их применяют
`prisma db execute`). Для пустой базы правильно `prisma db push`: он строит всё из `schema.prisma` (так же делают `Dockerfile` и
`railway.toml`). Проверено по файлам миграций: объектов вне схемы нет — ни расширений, ни функций, ни триггеров, ни частичных
индексов; все 61 `CREATE INDEX` из миграций объявлены в `schema.prisma` (`@@index`, `@@unique`, `@unique`), enum'ы тоже в схеме.
Данных-«сидов» миграции не создают. Поэтому ничего дополнительно применять не нужно.
Нужные приложению стартовые строки (языки для переключателя, `SiteSettings`, владелец) создаёт `init`.

Новые изменения схемы: `git pull` → `npx prisma db push --skip-generate`. Если Prisma предупреждает о потере данных, **не** добавляйте
`--accept-data-loss` вслепую: сначала бэкап (`pg_dump`).

### 3. Первый владелец (ADMIN/OWNER) на пустой базе
`prisma/seed.ts` **не запускать**: он создаёт тестовых пользователей с известными паролями и демо-контент fomo.spot.

```bash
bash scripts/terminal-instance-setup.sh init      # спросит e-mail и пароль (пароль не отображается)
# или без вопросов:
OWNER_EMAIL=you@example.com OWNER_PASSWORD='…' bash scripts/terminal-instance-setup.sh init
```

`scripts/terminal-instance-init.ts` берёт e-mail и пароль только из окружения, хеширует тем же bcrypt (cost 10), что и
регистрация, создаёт пользователя с ролью `OWNER` и статусом `APPROVED` (или у существующего сбрасывает пароль и закрывает
старые сессии). Он откажется работать, если в имени базы нет слова `terminal` (защита от запуска по базе fomo.spot; `--force` — на свой риск).
Остальные люди регистрируются сами на `/register` (код приходит по e-mail, одобрение не нужно), роли выдаются в `/admin/users`.

### 4. Ключи в `/opt/fomo-terminal/.env` (вписать вручную, секреты в git не попадают)
- `RESEND_API_KEY` — без него никто не сможет зарегистрироваться (код приходит письмом). Домен отправителя должен быть подтверждён в Resend;
  по умолчанию `EMAIL_FROM="FOMO Terminal <no-reply@fomo.spot>"`.
- `FCM_SERVICE_ACCOUNT_FILE=<тот же файл, что у /opt/fomo>` — ключ сервис-аккаунта проекта `fomo3-c2798` (приложение `spot.fomo.terminal` добавлено в тот же Firebase-проект, отдельный проект и ключ не нужны)
  (Firebase → Project settings → Service accounts → Generate new private key; файл вне репозитория, `chmod 600`, читает пользователь pm2).
  `project_id` берётся из самого файла, `FCM_PROJECT_ID` не нужен.
- По желанию: `TINKOFF_TOKEN` / `TINKOFF_READONLY_TOKEN`, `ALGOPACK_KEY`, `FMP_API_KEY`, `TELEGRAM_BOT_*`. Ключи fomo.spot можно использовать
  повторно только осознанно: у MOEX ALGOPACK и Tinkoff есть лицензионные условия.

После правки `.env`: `pm2 restart fomo-terminal --update-env`; если менялись `NEXT_PUBLIC_*` — пересборка.

### 5. nginx и сертификат
```bash
INSTALL_NGINX=1 bash scripts/terminal-instance-setup.sh nginx   # server_name terminal.fomo.spot -> 127.0.0.1:3100
sudo nginx -t && sudo systemctl reload nginx
bash scripts/terminal-instance-setup.sh certbot                 # certbot --nginx -d terminal.fomo.spot --redirect
```
Что в vhost: проксирование на порт инстанса, `/api/socketio` с заголовками WebSocket (Upgrade/Connection), gzip, `client_max_body_size 25m`,
`X-Content-Type-Options`, `Referrer-Policy`, отдача APK из `public/app/dl/` самим nginx (докачка). Если у vhost fomo.spot gzip/заголовки
отличаются — уравняйте их (файл fomo.spot на сервере в репозитории не лежит, я его не видел).
**Путь Socket.IO — `/api/socketio`** (не `/socket.io`).

### 6. Обновление инстанса (swap-deploy, как у /opt/fomo)
```bash
cd /opt/fomo-terminal && git pull --ff-only && npm install --no-audit --no-fund && npx prisma generate && npx prisma db push --skip-generate \
 && NEXT_DIST_DIR=.next-build npm run build && rm -rf .next-old && mv .next .next-old && mv .next-build .next \
 && pm2 restart fomo-terminal --update-env && rm -rf .next-old
```
Сборка идёт в `.next-build`, пока работающий сервер читает `.next`, поэтому открытые страницы не ловят ошибки подгрузки чанков.
Сборку двух инстансов не запускать одновременно (память).

### 7. Android-приложение «FOMO Terminal»
Отдельный пакет `spot.fomo.terminal`, тот же Firebase-проект `fomo3-c2798` (отдельное Android-приложение); детали — `android/README.md`.
1. Firebase → проект `fomo3-c2798` → добавить Android-приложение с пакетом `spot.fomo.terminal`, указать SHA-1 релизного ключа
   (`keytool -list -v -keystore <release.jks> -alias fomo`).
2. Скачать `google-services.json` → положить в `android/app/src/terminal/google-services.json` (в публичном репозитории ограничьте API-ключ
   пакетом и SHA-1) и пересобрать: `& "C:\Users\viptd\tools\build-fomo.ps1" assembleTerminalRelease`. Пока файла нет, приложение собирается и
   работает, но без push.
3. Положить APK на сервер: либо через ветку `downloads` (`scripts/publish-downloads.ps1`, см. `docs/downloads.md`: она же публикует
   `FOMO-Terminal-Setup.exe` и записи в `public/app/dl-info.json`), либо вручную
   `scp FOMO-Terminal.apk server:/opt/fomo-terminal/public/app/dl/FOMO-Terminal.apk` (папка `public/app/dl/` в `.gitignore`).
   Ссылка на лендинге — `/app/dl/FOMO-Terminal.apk`; проверка обновления приложения читает `https://terminal.fomo.spot/app/terminal-version.json`
   (при выпуске новой версии поднимите `versionCode` в `android/app/build.gradle.kts` и в `public/app/terminal-version.json` вместе).
4. App Links: `https://terminal.fomo.spot/.well-known/assetlinks.json` отдаётся тем же файлом `public/.well-known/assetlinks.json` (в нём уже есть пакет `spot.fomo.terminal`).

### 8. Приложения для компьютера (Windows / macOS)
Тот же Electron-код из `desktop/` собирается во втором варианте (flavor `terminal`, `npm run dist:terminal`): «FOMO Terminal»,
`https://terminal.fomo.spot`, свой appId и профиль (`%APPDATA%\FOMO Terminal`), установщик `FOMO-Terminal-Setup.exe`
(см. `desktop/README.md`). На лендинге терминала (`TerminalLanding` -> `DownloadAppsBlock flavor="terminal"`) плитки:
Android (`/app/dl/FOMO-Terminal.apk`), Windows (`/app/dl/FOMO-Terminal-Setup.exe`, показывается, когда в `public/app/dl-info.json`
есть запись `terminal.windows`) и macOS (`/app/dl/FOMO-Terminal.dmg`, только когда есть запись `terminal.macos`, то есть файл
собран и опубликован). Внутри самих приложений блок скрыт. Файлы кладутся на сервер терминала так же, как APK
(`/opt/fomo-terminal/public/app/dl/`, затем `pm2 restart fomo-terminal`, чтобы Next увидел новые файлы; или nginx отдаёт папку сам).

## Проверка после запуска
```bash
curl -s -o /dev/null -w "%{http_code}\n" https://terminal.fomo.spot/            # 200
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" https://terminal.fomo.spot/feed   # 307 -> /terminal
curl -s https://terminal.fomo.spot/api/ideas                                    # {"error":"Not found"}
curl -sD- -o /dev/null https://terminal.fomo.spot/api/auth/csrf | grep -i set-cookie   # __Host-terminal.csrf-token, __Secure-terminal.callback-url
curl -s https://terminal.fomo.spot/robots.txt | tail -2                         # Sitemap: https://terminal.fomo.spot/sitemap.xml
```
Затем: регистрация нового пользователя по e-mail, вход, создание алерта в терминале, колокольчик в календаре.

## Известные ограничения и решения владельца
- Юридические страницы `/privacy` и `/terms` — те же тексты, что у fomo.spot (в них говорится о платформе FOMO). Для отдельного продукта
  стоит дать свои тексты.
- Справка `/help` скрыта целиком (она про платформу идей); краткой справки по терминалу нет.
- Страница `/terminal/features` оставлена (рассказ о терминале), её тексты общие с fomo.spot.
- Сервис-воркер `public/sw.js` и его кэши (`fomo-v6`) одинаковы, но у каждого сайта свой origin, поэтому пересечений нет.
- Уже существующая особенность (не из этого изменения): сокет-сервер доверяет `userId`, который клиент присылает в handshake
  (`server/socket.ts`). На инстансе это те же права, что и на fomo.spot; id пользователей двух баз не пересекаются.
- На сервере два Next.js-процесса: следите за памятью (pm2 `max_memory_restart` для инстанса — 1500M).
