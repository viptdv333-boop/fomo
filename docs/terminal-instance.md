# FOMO Terminal — отдельный инстанс terminal.fomo.spot

Тот же код, второй экземпляр: свой checkout (`/opt/fomo-terminal`), свой `.env`, **своя база PostgreSQL и свои пользователи**,
свой процесс pm2 (`fomo-terminal`) на другом порту, свой vhost nginx. С `fomo.spot` не общего ничего: ни базы, ни
`AUTH_SECRET`, ни cookie, ни ключей; **единственное исключение: аккаунт и профиль зеркалируются между двумя базами** (раздел
«Единый аккаунт» ниже). Режим включается переменными окружения; если они не заданы, `fomo.spot` ведёт себя
ровно так же, как раньше.

В копии есть только: Терминал (календарь — вкладка внутри него), уведомления (колокольчик, push, Telegram, e-mail, Android), профиль
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
| `TERMINAL_CONTACT_EMAIL` | во время работы, необязательно | публичный адрес для связи, он печатается на `/privacy` и `/terms` (раздел «Контакты»). Пусто = на страницах написано «через форму обратной связи на https://fomo.spot», адрес не показывается. Личную почту сюда не ставить |
| `GOOGLE_SITE_VERIFICATION` | во время работы, необязательно | содержимое (`content`) метатега Google Search Console; пусто = тега нет |
| `YANDEX_VERIFICATION` | во время работы, необязательно | содержимое метатега Яндекс.Вебмастера; пусто = тега нет |
| `ACCOUNT_MIRROR_SECRET` | во время работы, **на обоих инстансах одинаковый** | общий секрет подписи зеркала аккаунтов (не короче 32 символов). Нет секрета или адреса пира = зеркало **выключено** |
| `ACCOUNT_MIRROR_PEER_URL` | во время работы | origin **другого** инстанса по loopback: у fomo.spot `http://127.0.0.1:3100` (порт терминала), у терминала `http://127.0.0.1:3000` (порт fomo.spot). Не публичный https-адрес |

Без `SITE_MODE` / `NEXT_PUBLIC_SITE_MODE` сайт — обычный fomo.spot (`siteUrl()` = `https://fomo.spot`, cookie
`authjs.*`, все страницы). Логика: `src/lib/site-mode.ts`, проверка: `npx tsx scripts/check-site-mode.ts`.

### Что делает режим terminal

- **Страницы — allowlist** (`routeAllowed`, middleware): `/`, `/login`, `/register`, `/forgot-password`, `/terminal`,
  `/profile`, `/calculator`, `/privacy`, `/terms`, `/admin`, `/admin/users`, `/admin/broadcast`, `/admin/site-settings`.
  `/calculator` — калькулятор риска и размера позиции (фьючерсы Мосбиржи; данные контракта — `GET /api/futures/spec` из публичного ISS, без БД и без идей); в приложении — вкладка дока «Калькулятор» (после «Терминала»; также профиль → «Калькулятор» и карточка в терминале по фьючерсу), входа требует так же, как `/terminal`.
  Всё остальное (в т. ч. любые новые страницы) — редирект на `/terminal` (закрытые разделы админки — на `/admin`).
  `/` для гостя — лендинг «FOMO Terminal» (`TerminalLanding`), для вошедшего — редирект на `/terminal`.
  Отдельной страницы `/calendar` и страницы `/terminal/features` нет: `/calendar` ведёт на `/terminal?panel=calendar` (открывает вкладку
  «Календарь»; так же работают старые ссылки напоминаний `/calendar#дата`), `/terminal/features` — на `/terminal`.
- **Вход обязателен, гостевого демо нет**: `/terminal*`, `/calculator` (и `/calendar`) для гостя — редирект на `/login?callbackUrl=<путь>`
  (middleware, `terminalNeedsLogin` в `site-mode.ts`); после входа человек попадает на запрошенную страницу (по умолчанию `/terminal`).
  Публичны только `/`, `/privacy`, `/terms`, `/login`, `/register`, `/forgot-password`. **Публичные API с рыночными данными**
  (`klines`, `quote(s)`, `market-search`, `orderbook`, `news`, `economic-calendar` и др.) по-прежнему открыты без входа: закрывать их
  было бы отдельной задачей (могут ломаться приложение и виджеты). Код демо-режима (`DemoGate`) в сборке остаётся для fomo.spot.
- **API — тоже allowlist**: чужие маршруты отвечают `404 {"error":"Not found"}`. Проверка стоит в `server.ts` (видит все
  `/api/*`) и в middleware (дублирует для тех, что он видит). Открыты: `auth`, `captcha`, `terminal`, `calendar`,
  `economic-calendar`, `klines`, `quote(s)`, `market-search`, `contracts`, `orderbook`, `orderflow`, `algopack`, `futures` (только `spec` — калькулятор), `news`,
  `notifications`, `notification-settings` (в т. ч. вебхуки ботов), `push`, `telegram`, `me`, `languages`, `site-settings`,
  `version`, `upload`, `socketio`, `fomo-ideas` (см. ниже), `users` и `users/<id>` (профиль и список для админа), `admin/stats|broadcast|site-settings`.
- **Админка** `/admin` доступна только ADMIN / OWNER (проверяет middleware), в меню сайта ссылки на неё нет; в самой админке
  оставлены разделы «Пользователи», «Рассылка», «Настройки сайта».
- **Cookie** сессии: `terminal.session-token` (по http) или `__Secure-terminal.session-token`, `__Secure-terminal.callback-url`,
  `__Host-terminal.csrf-token` (по https). Без `Domain` (только свой хост). Сессия fomo.spot (`authjs.*`, другой секрет) здесь не
  читается, и наоборот. Ни в одном месте кода нет общего cookie-домена.
- **Настройки уведомлений**: матрица показывает «Терминал и календарь» (price_alert, line_alert, calendar_reminder) и «Система».
  Социальные события и платежи скрыты.
- **Нижнее меню приложения (app UI)**: Терминал, Настройки, Профиль. Календарь внутри терминала: на компьютере вкладка «Календарь» правой
  панели рядом со списком наблюдения, в app UI переключатель «Список наблюдения | Календарь» под рядом инструментов (`AppTerminal`).
- **Идеи и сообщество fomo.spot** (в терминале, не на лендинге): `GET /api/fomo-ideas?ticker=SBER[&alt=<dataTicker>]` — серверный прокси
  (`src/app/api/fomo-ideas/route.ts`, чистая часть `src/lib/fomo-ideas.ts`): только для вошедшего, на fomo.spot самом отвечает 404; тикер
  `^[A-Za-z0-9._-]{1,20}$`; сервер запрашивает `https://fomo.spot/api/instruments?search=` и `/api/ideas?instrumentId=&limit=5` (таймаут 4 с,
  без cookie), кэш в памяти 5 мин (сбой — 1 мин), при недоступности fomo.spot отвечает `{ok:false}` и интерфейс молчит. Ответ:
  `{ok, count, ideas:[{id,title,author,likes,createdAt,url}], boardUrl}`, `url` = `https://fomo.spot/ideas/<id>`. Показ: вкладка «Идеи FOMO» правой
  панели, карточка «Идеи FOMO по <тикер>» в app UI; ссылки открываются в новой вкладке (в Android-приложении fomo.spot — чужой хост, его
  открывает системный браузер). Карточка «FOMO — сообщество трейдеров» — под списком наблюдения и во вкладке идей, строка в профиле app UI.
- **Брендинг**: title/description «FOMO Terminal …», manifest «FOMO Terminal» (`start_url /terminal`, без share target),
  иконки `public/icons-terminal/*`, canonical и hreflang на `terminal.fomo.spot`, OG-картинка `public/landing/terminal/og.jpg`, нет Яндекс.Метрики и
  Google Analytics (счётчики fomo.spot), sitemap — только лендинг и юридические страницы, без обращений к базе. Тег подтверждения fomo.spot (Яндекс)
  здесь не выводится никогда; свои теги Google / Яндекса — только из `GOOGLE_SITE_VERIFICATION` / `YANDEX_VERIFICATION` (см. «SEO» ниже).
- **Socket.IO**: CORS только на адрес инстанса (на fomo.spot по-прежнему `*`).

## Единый аккаунт: зеркало между двумя базами

Решение владельца: «создание профиля в терминале = созданию профиля на fomo.spot и наоборот». Базы остаются раздельными (алерты,
списки наблюдения, идеи, подписки, чаты, сообщения, платежи **не** общие); между ними копируются только аккаунт и профиль. Код один, поэтому
одна и та же реализация работает в обе стороны.

**Выключатель.** Пока не заданы оба `ACCOUNT_MIRROR_SECRET` и `ACCOUNT_MIRROR_PEER_URL` (и секрет не короче 32 символов), зеркало
выключено целиком: вызовы отправки возвращаются сразу, эндпоинт отвечает 404, поведение сайтов прежнее. Поэтому код можно выкатить до
появления секрета. Включение: `bash scripts/setup-account-mirror.sh` на сервере (создаёт случайный секрет `openssl rand -hex 32`, **только если**
его нет в `/opt/fomo/.env`; дописывает тот же секрет и нужный `ACCOUNT_MIRROR_PEER_URL` в оба `.env`, остальные строки и права файлов не трогает,
секрет не печатает, выводит только строки `OK` / `changed`, ничего не перезапускает), затем деплой (`deploy-swap.sh` делает `pm2 restart --update-env`) или
`pm2 restart fomo fomo-terminal --update-env`. Порты берутся из `PORT` в `.env` каждого инстанса (по умолчанию 3000 и 3100).

**Что зеркалируется** (отправитель: тот сайт, где это произошло; вызовы в фоне, `src/lib/account-mirror-client.ts`):

| Событие | Где | Что получает другая сторона |
|---|---|---|
| Регистрация | `api/auth/register` | `register`: создать аккаунт (email, **хэш** пароля, профиль). Если там висит брошенный PENDING с этим адресом, он дописывается так же, как это делает локальная регистрация |
| Вход (ленивая подтяжка) | `lib/auth.ts`, `authorize` после успешной проверки пароля | `ensure`: создать аккаунт, **только если** адреса там нет; существующий не трогается (разные пароли остаются разными до смены или сброса). Один запрос на адрес и процесс в 6 часов |
| Смена пароля | `api/auth/change-password` | `password`: новый хэш + `sessionVersion + 1` (старые сессии там тоже закрываются) |
| Сброс пароля | `api/auth/reset-password` (шаг `reset`) | то же |
| Смена e-mail | `api/auth/change-email` (шаг `verify`) | `email`: найти по **старому** адресу, переименовать, `sessionVersion + 1` |
| Правка профиля | `PATCH api/users/[id]` (профиль, аватар, ник/`fomoId`, в том числе правка админом), `POST api/me/locale` | `profile`: только изменённые поля из белого списка |

Не зеркалируется: вход/выход, бан и роли, оценка, оплата, `terminal-instance-init.ts` (первый владелец создаётся только в своей базе), отправка кода
(`send-code`: пользователя не создаёт). Массовой миграции нет: существующие аккаунты появляются на другой стороне при первом входе.

**Белый список полей профиля** (`PROFILE_FIELDS` в `src/lib/account-mirror.ts`; `scripts/check-account-mirror.ts` сверяет его со `schema.prisma`:
каждое скалярное поле `User` обязано быть либо в белом списке, либо в списке исключений, иначе проверка падает):

| Поле | Решение |
|---|---|
| `displayName`, `firstName`, `lastName`, `bio`, `birthDate`, `city`, `workplace`, `exchangeExperience`, `specializations`, `socialLinks`, `locale`, `dmEnabled` | зеркалируются |
| `fomoId` (ник, уникальный идентификатор) | зеркалируется; при создании берётся тот же, а если он занят другим пользователем на той стороне: `<id>_<4 hex от sha256(email)>` (детерминированно), затем случайный; ответ несёт `fomoIdChanged`, в лог пишется `(fomoId changed)`. При последующей смене, если нужный id там занят, поле пропускается (`skipped: fomoId`), остальное применяется |
| `avatarUrl` | зеркалируется как **файл** (см. ниже) |
| `email`, `passwordHash` | отдельные операции (`email`, `password`), в `profile` не передаются |
| `role`, `status`, `bannedUntil`, `banReason` | **не зеркалируются**: админ одного сайта не управляет другим; новый аккаунт всегда `APPROVED` / `USER` (в формате сообщения этих полей нет) |
| `rating`, `ratingBonus`, `lastPublishedAt` | не зеркалируются (счётчики сервиса идей) |
| `sessionVersion` | не зеркалируется; увеличивается на стороне-получателе при смене пароля или e-mail |
| `subscriptionPrice`, `paymentCard`, `donationCard`, `sbpQrUrl` | не зеркалируются (деньги и платные сервисы fomo.spot) |
| `id`, `createdAt`, `updatedAt` | локальные |
| связи (`Education`, идеи, тарифы, алерты ...) | не зеркалируются |

**Аватарки.** Загрузка кладёт 200x200 JPEG в `public/uploads/avatars/<userId>/<uuid>.jpg`, `avatarUrl` относительный (`/uploads/avatars/...`), а `/uploads/*`
отдаёт `server.ts` самого инстанса; у второго сайта такого файла нет, поэтому относительная ссылка там была бы битой. Решение: в сообщении идёт **только
путь**, получатель сам скачивает файл у пира (`ACCOUNT_MIRROR_PEER_URL` + путь, loopback), проверяет путь регуляркой
`/uploads/avatars/<id>/<имя>.(jpg|jpeg|png|webp|gif)`, не следует редиректам, ограничивает размер (2 МБ), проверяет формат по первым байтам (а не по
`Content-Type`), перекодирует через sharp в 200x200 JPEG и сохраняет в **свой** `public/uploads/avatars/<свой userId>/`. Итог: аватар не зависит от
доступности другого сайта, сторонних адресов в `avatarUrl` не появляется (внешние URL в аватарке не зеркалируются вовсе), хотлинка нет. Если скачать не удалось,
аватар на другой стороне остаётся прежним (`skipped: avatarUrl`), остальные поля применяются. Удаление аватара (`null`) зеркалируется.

**Транспорт.** Только сервер-сервер: `POST {PEER_URL}/api/internal/account-mirror` (маршрут `src/app/api/internal/account-mirror/route.ts`, на терминале
разрешён точечно в `routeAllowed`; остальные `/api/internal/*` закрыты). Заголовки `x-mirror-timestamp` (мс), `x-mirror-nonce`, `x-mirror-signature` =
hex HMAC-SHA256(секрет, `timestamp.nonce.тело`). Получатель: окно 60 с, nonce запоминается на 120 с (повтор = 404), сравнение за постоянное время,
тело не больше 64 КБ, затем лимит 300 запросов в минуту (после проверки подписи, чтобы чужие запросы не съедали лимит пира), затем zod-схема. **404** (а не 401) при
незаданном секрете, неверной подписи, повторе nonce и любом методе кроме POST; 400 для верной подписи и неверных данных. Ответ несёт только `result`
(`created`, `completed`, `exists`, `alias_conflict`, `updated`, `noop`, `not_found`, `conflict`) и поля `skipped` / `fomoIdChanged`; хэшей и адресов там нет.
Идемпотентность: создание «если нет», правка «если совпало», повтор даёт `exists` / `noop`. Получатель никогда не вызывает отправку, зацикливания нет.
Отправитель: таймаут 3,5 с на попытку, 3 попытки (сразу, через 0,4 и 1,2 с) на 5xx, 429 и сетевые ошибки, 404 и 400 не повторяются; запросы по одному аккаунту идут
по очереди внутри процесса. Сбой зеркала **никогда** не влияет на локальную операцию (она уже выполнена, отправка идёт в фоне). В логи попадают только операция и исход,
без адресов, хэшей и секрета. По желанию можно закрыть маршрут снаружи в nginx обоих сайтов: `location = /api/internal/account-mirror { return 404; }`
(пиры ходят по loopback мимо nginx).

**Порядок записей и конфликты.** Побеждает последняя пришедшая запись (поле `updatedAt` для этого не годится: Prisma меняет его при любой записи, например при
пересчёте рейтинга, и честная правка профиля могла бы отброситься). Одновременные правки одного поля на двух сайтах: остаётся то, что пришло позже.
Адрес, уже занятый на другой стороне, остаётся с тем паролем, который там был: пароли выравнивает смена или сброс пароля. Другое написание того же ящика
(точки и `+` в gmail) на стороне-получателе не создаётся (`alias_conflict`), как и при локальной регистрации.

**Проверка:** `npx tsx scripts/check-account-mirror.ts` (подпись, окно, nonce, схема, белый список, статус, fomoId, аватар, отправитель против фейкового пира).
Сквозная проверка нужна на двух запущенных серверах: после деплоя и `setup-account-mirror.sh` завести временный аккаунт на терминале, убедиться, что на fomo.spot он входит тем же паролем
(в логе `pm2 logs fomo` строка `[account-mirror] register: created`), поменять ник и аватар на fomo.spot и увидеть их в профиле терминала, сменить пароль и e-mail,
затем удалить временные аккаунты.

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

## SEO и поисковики (только режим terminal)
- **Лендинг** `/` (`TerminalLanding`): весь текст в серверном HTML (анимации — CSS, FAQ в `<details>`), H1 «Торговый терминал онлайн», разделы
  «Что внутри» и «Частые вопросы»; никаких «бесплатно», тарифов и сравнения с другими сервисами (проверяет `check-site-mode`). Во всех текстах названы
  мировые фьючерсы NYMEX / COMEX / CME / ICE (так и есть в коде: FMP, непрерывный ряд ближайшего контракта, `us-futures.ts`), без обещаний реального времени.
  JSON-LD: Organization, WebSite, SoftwareApplication (без `offers`, ссылки на скачивание из `dl-info.json`) и FAQPage — из тех же ключей, что и видимый список (`src/lib/terminal-seo.ts`, `terminal-faq.ts`). Тексты — `src/lib/i18n/dict/termsite.ts` (ru/en/cn).
- **Мета**: title/description для `/` и `/terminal` свои (ключи `termsite.*`), canonical + hreflang ru/en/zh, Open Graph и Twitter-карточка с
  `public/landing/terminal/og.jpg` (1200×630). `/terminal`, `/login`, `/register`, `/forgot-password`, `/profile`, `/admin` — noindex.
- **sitemap.xml**: `/`, `/privacy`, `/terms` в трёх языках с lastmod (`TERMINAL_STATIC_LASTMOD` в `terminal-seo.ts`, поднимать при смене текстов);
  терминал за входом, его в карте нет. **robots.txt** (`terminalRobotsTxt`): разрешён `/`, закрыты `/terminal`, `/calendar`, `/login`, `/register`,
  `/forgot-password`, `/profile`, `/admin`, `/api` (и их копии под `/en`, `/zh`), указан sitemap.
- **Подтверждение владения**: в `.env` инстанса `GOOGLE_SITE_VERIFICATION=<content метатега>` и/или `YANDEX_VERIFICATION=<content метатега>`, затем
  `pm2 restart fomo-terminal --update-env` (пересборка не нужна: читается при запросе). Появятся `<meta name="google-site-verification">` / `<meta name="yandex-verification">`.
  Далее в Google Search Console / Яндекс.Вебмастере добавить `https://terminal.fomo.spot`, подтвердить, отправить `/sitemap.xml`.
- `src/lib/terminal-compare.ts` (сравнение с тарифами TradingView) оставлен как данные, на сайте не показывается.
- **Медиа лендинга**: `public/landing/terminal/*.webp` (скриншоты терминала, календаря и мобильного интерфейса), `hero.mp4` (≈1 МБ, без звука, фон героя на широких
  экранах), `logo.webp`, `og.jpg`. Скриншоты сняты с демо-режима без личных данных; перед заменой проверьте, что на кадре нет ничего личного.

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
- Аккаунт и профиль общие с fomo.spot (зеркало, см. выше). Об этом говорят тексты `termlegal.privacy.s1.p1 / s2.li1 / s5.p2`, `termlegal.terms.s1.p2`,
  `termsite.separate`, `termsite.faq.a1` и абзац в `privacy.s5.p2` на fomo.spot (`legal.ts`); если зеркало уберут или изменится состав полей, поправьте их.
  Дата вступления в силу (`TERMINAL_LEGAL_DATE`) при этой правке не менялась: решите при выкатке.
- Юридические страницы `/privacy` и `/terms` на терминале — **свои тексты** о терминале (ru / en / cn, ключи `termlegal.*` в
  `src/lib/i18n/dict/termlegal.ts`, раскладка разделов и проверка ключей — `src/lib/terminal-legal.ts`, страница —
  `src/components/legal/TerminalLegal.tsx`); на fomo.spot остаются прежние тексты. Это **черновики**: перед тем как на них опираться,
  покажите юристу. Оператор в текстах — физическое лицо, бренд «Neurotrader» (юрлица, адреса, ИНН нет). Контакт: `TERMINAL_CONTACT_EMAIL`
  (см. таблицу выше); пока не задан, написано «форма обратной связи на https://fomo.spot» и адрес не печатается. Если меняются состав
  данных, обработчики (Resend, FCM, Telegram, Timeweb), cookie или появляется оплата/аналитика, поправьте тексты и дату
  (`TERMINAL_LEGAL_DATE`, ключи `effective`, `TERMINAL_STATIC_LASTMOD`). Проверка: `npx tsx scripts/check-site-mode.ts`.
  Уведомление о cookie и подпись у галочки на регистрации в режиме terminal тоже свои (`termlegal.cookie.text`, `termlegal.register.disclaimer`).
- Справка `/help` скрыта целиком (она про платформу идей); краткой справки по терминалу нет.
- Страница `/terminal/features` на терминале закрыта (её тексты общие с fomo.spot и говорят «бесплатно»).
- Сервис-воркер `public/sw.js` и его кэши (`fomo-v6`) одинаковы, но у каждого сайта свой origin, поэтому пересечений нет.
- Уже существующая особенность (не из этого изменения): сокет-сервер доверяет `userId`, который клиент присылает в handshake
  (`server/socket.ts`). На инстансе это те же права, что и на fomo.spot; id пользователей двух баз не пересекаются.
- На сервере два Next.js-процесса: следите за памятью (pm2 `max_memory_restart` для инстанса — 1500M).
