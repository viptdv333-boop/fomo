import type { SectionDict } from "./types";

// Privacy policy and terms of use of the TERMINAL site (terminal.fomo.spot, SITE_MODE=terminal), about the terminal product only:
// no ideas / channels / payments of the social platform fomo.spot. Only read in terminal mode (src/components/legal/TerminalLegal.tsx);
// the main site keeps its own legal.ts. The page layout (which keys are used where) is in src/lib/terminal-legal.ts and is checked by
// scripts/check-site-mode.ts. The Russian text is the original, en / cn are convenience translations. DRAFTS: have a lawyer review them.
// Placeholders: {email} / {url} in the contact paragraph and {privacy} in terms.s1.p1 are replaced with links by the page.
const dict: SectionDict = {
  ru: {
    "termlegal.note": "",
    "termlegal.seo.privacy.title": "Политика конфиденциальности",
    "termlegal.seo.privacy.description": "Какие данные обрабатывает торговый терминал FOMO Terminal, зачем, кому они передаются и как ими управлять.",
    "termlegal.seo.terms.title": "Условия использования",
    "termlegal.seo.terms.description": "Условия использования торгового терминала FOMO Terminal: аккаунт, допустимое использование, данные рынка, риски и ответственность.",
    "termlegal.cookie.text": "Терминал использует только необходимые cookie: для входа в аккаунт и сохранения языка. Рекламы и аналитики нет. Продолжая пользоваться FOMO Terminal, вы соглашаетесь с",
    "termlegal.register.disclaimer": ". Мне понятно, что терминал не является инвестиционной рекомендацией, а торговля финансовыми инструментами связана с риском потерь.",

    // ---------- Privacy ----------
    "termlegal.privacy.title": "Политика конфиденциальности FOMO Terminal",
    "termlegal.privacy.effective": "Действует с 06.10.2026",

    "termlegal.privacy.s1.h": "1. О чём этот документ",
    "termlegal.privacy.s1.p1":
      "Здесь описано, какие персональные данные обрабатывает FOMO Terminal (сайт terminal.fomo.spot, приложение для Android и установщик для Windows; далее — «Терминал»), зачем и что вы можете с ними сделать. У Терминала отдельные аккаунты и отдельная база данных: аккаунт и данные сайта fomo.spot здесь не действуют и не передаются.",
    "termlegal.privacy.s1.p2":
      "Оператор Терминала — физическое лицо, работающее под брендом «Neurotrader» (далее — «Оператор»). Как с ним связаться — в разделе 13. Регистрируясь, вы подтверждаете, что прочитали эту политику и Условия использования.",

    "termlegal.privacy.s2.h": "2. Какие данные мы обрабатываем",
    "termlegal.privacy.s2.p1": "Только то, что нужно для работы Терминала:",
    "termlegal.privacy.s2.li1":
      "аккаунт: адрес e-mail, пароль (хранится только в виде хэша bcrypt, сам пароль нам неизвестен), отображаемое имя, при желании имя, фамилия и фото профиля, роль и статус аккаунта, язык и тема интерфейса;",
    "termlegal.privacy.s2.li2":
      "ваши настройки терминала: списки наблюдения, раскладки графиков, индикаторы и их параметры, нарисованные линии и фигуры, шаблоны. Они сохраняются в аккаунте, чтобы быть одинаковыми на всех устройствах;",
    "termlegal.privacy.s2.li3": "оповещения и напоминания: условия ценовых алертов и алертов по линиям, напоминания экономического календаря, время и статус срабатывания;",
    "termlegal.privacy.s2.li4":
      "данные для доставки уведомлений, если вы их подключили: e-mail; адрес подписки браузера для web push; токен устройства Android (Firebase Cloud Messaging), название устройства и версия приложения; идентификатор чата Telegram и, если вы подключаете собственного бота, токен этого бота; номер телефона для WhatsApp; идентификаторы диалогов в Max и VK; адрес webhook и ключ его подписи;",
    "termlegal.privacy.s2.li5": "одноразовые коды подтверждения (регистрация, смена e-mail, сброс пароля): они действуют 15 минут, мы считаем неверные попытки ввода;",
    "termlegal.privacy.s2.li6":
      "технические данные: IP-адрес и user-agent браузера или приложения в журналах сервера, счётчики ограничения частоты запросов (защита от подбора пароля и перегрузки), записи об ошибках;",
    "termlegal.privacy.s2.li7": "cookie и локальное хранилище браузера: см. раздел 7.",
    "termlegal.privacy.s2.p2": "Мы не запрашиваем платёжные и паспортные данные, не подключаемся к вашему брокерскому счёту и не видим ваших сделок.",

    "termlegal.privacy.s3.h": "3. Зачем и на каком основании",
    "termlegal.privacy.s3.p1": "Данные обрабатываются для:",
    "termlegal.privacy.s3.li1": "создания аккаунта и входа, хранения ваших настроек, алертов и напоминаний: это необходимо для работы Терминала по Условиям использования;",
    "termlegal.privacy.s3.li2":
      "доставки уведомлений, которые вы включили: по вашему согласию, которое можно отозвать, отключив способ доставки в «Профиль → Настройки уведомлений»;",
    "termlegal.privacy.s3.li3": "безопасности и защиты от злоупотреблений (ограничение частоты запросов, защита от подбора паролей, разбор ошибок): это наш законный интерес;",
    "termlegal.privacy.s3.li4": "служебных сообщений о работе Терминала (коды, важные изменения) и ответов на ваши обращения;",
    "termlegal.privacy.s3.li5": "выполнения требований закона.",

    "termlegal.privacy.s4.h": "4. Реклама, аналитика и продажа данных",
    "termlegal.privacy.s4.p1":
      "В Терминале нет рекламных и аналитических трекеров: не подключены Яндекс.Метрика, Google Analytics, пиксели соцсетей и подобные сервисы. Данные не используются для рекламы и профилирования.",
    "termlegal.privacy.s4.p2":
      "Мы не продаём и не сдаём в аренду персональные данные. Если состав обработчиков изменится (например, появится аналитика), мы обновим эту политику до начала такой обработки.",

    "termlegal.privacy.s5.h": "5. Кому мы передаём данные",
    "termlegal.privacy.s5.p1": "Данные получают только те, без кого функция не работает, и только в нужном объёме:",
    "termlegal.privacy.s5.li1": "хостинг-провайдер Timeweb: на его серверах работают Терминал и база данных, серверы находятся в России;",
    "termlegal.privacy.s5.li2":
      "Resend (сервис отправки почты): ваш адрес e-mail и текст письма: коды подтверждения, письма о смене пароля и e-mail, уведомления, если выбран e-mail;",
    "termlegal.privacy.s5.li3":
      "Google (Firebase Cloud Messaging): токен устройства и текст уведомления для push на Android; браузерные web push доставляются через push-сервис вашего браузера;",
    "termlegal.privacy.s5.li4":
      "Telegram, WhatsApp (Meta), Max, VK: идентификатор получателя и текст уведомления, только если вы сами подключили этот способ доставки; webhook получает уведомления на указанный вами адрес;",
    "termlegal.privacy.s5.li5":
      "источники рыночных данных (МосБиржа, Bybit, FMP и другие): запросы за котировками, как правило, выполняет сервер Терминала, данные вашего аккаунта им не передаются;",
    "termlegal.privacy.s5.li6": "государственные органы: только по обоснованному требованию, предусмотренному законом.",
    "termlegal.privacy.s5.p2": "Каждый из этих сервисов обрабатывает данные по своим правилам. Подключать ли Telegram, WhatsApp, Max, VK или webhook, решаете вы.",

    "termlegal.privacy.s6.h": "6. Где хранятся данные",
    "termlegal.privacy.s6.p1":
      "База данных и серверы Терминала находятся в России (Timeweb). Чтобы работали почта, push и подключённые вами сервисы, часть данных (адрес e-mail, токен устройства, идентификатор получателя и текст уведомления) может передаваться за пределы России, в страны, где расположены Resend, Google, Telegram и другие обработчики. Уровень защиты данных там может отличаться от вашей страны.",
    "termlegal.privacy.s6.p2":
      "Почта нужна для регистрации, поэтому передача адреса e-mail почтовому сервису неизбежна; остальные передачи зависят от способов уведомления, которые вы включаете.",

    "termlegal.privacy.s7.h": "7. Cookie и локальное хранилище",
    "termlegal.privacy.s7.p1": "Терминал использует только необходимые cookie. Они привязаны к одному хосту, общего домена с другими сайтами нет:",
    "termlegal.privacy.s7.li1":
      "terminal.session-token (по https с префиксом __Secure-), terminal.callback-url и terminal.csrf-token (с префиксом __Host-): вход в аккаунт и защита форм; сессия действует до 30 дней;",
    "termlegal.privacy.s7.li2": "NEXT_LOCALE: выбранный язык интерфейса, хранится до года.",
    "termlegal.privacy.s7.p2":
      "В localStorage браузера хранятся настройки на этом устройстве: тема оформления (fomo-theme), отметка о том, что вы прочитали уведомление о cookie, настройки графиков, индикаторов и календаря, отметка «запомнить меня». Они лежат на вашем устройстве и очищаются средствами браузера; часть настроек графиков дополнительно синхронизируется с аккаунтом (раздел 2).",
    "termlegal.privacy.s7.p3": "Рекламных и аналитических cookie нет. Если запретить cookie, войти в аккаунт не получится.",

    "termlegal.privacy.s8.h": "8. Сроки хранения и удаление",
    "termlegal.privacy.s8.p1":
      "Данные аккаунта и ваши настройки хранятся, пока существует аккаунт. После удаления аккаунта связанные с ним данные (настройки, алерты, напоминания, способы уведомления, токены устройств) удаляются из базы данных.",
    "termlegal.privacy.s8.p2":
      "Одноразовые коды подтверждения действуют 15 минут. Журналы сервера хранятся ограниченное время, нужное для безопасности и разбора ошибок. Если у хостинга или у нас есть резервные копии, удалённые данные могут оставаться в них до плановой замены копий.",
    "termlegal.privacy.s8.p3":
      "Самостоятельного удаления аккаунта в приложении пока нет: чтобы удалить аккаунт, напишите Оператору (раздел 13) с адреса, указанного в аккаунте. Мы удалим данные в срок, установленный применимым законом, обычно не позднее 30 дней. Отдельные способы уведомления, подписки браузера и токены устройств можно отключить в «Профиль → Настройки уведомлений», e-mail и пароль изменить во вкладке «Безопасность».",

    "termlegal.privacy.s9.h": "9. Безопасность",
    "termlegal.privacy.s9.p1":
      "Пароли хранятся в виде хэша bcrypt, соединение с сайтом защищено HTTPS, токены собственных ботов и ключи webhook не возвращаются в браузер, а при смене пароля прежние сессии прекращаются. Мы ограничиваем доступ к данным, но не можем гарантировать абсолютную защиту: используйте уникальный пароль и не оставляйте вход в аккаунт на чужих устройствах.",

    "termlegal.privacy.s10.h": "10. Ваши права",
    "termlegal.privacy.s10.p1": "В зависимости от закона вашей страны вы вправе:",
    "termlegal.privacy.s10.li1": "получить подтверждение, что мы обрабатываем ваши данные, и копию этих данных;",
    "termlegal.privacy.s10.li2": "исправить неточные данные (имя, e-mail и пароль можно изменить в профиле);",
    "termlegal.privacy.s10.li3": "потребовать удаления данных или ограничения обработки, возразить против обработки;",
    "termlegal.privacy.s10.li4": "получить данные в удобном для переноса виде, если это применимо;",
    "termlegal.privacy.s10.li5": "отозвать согласие в любой момент; это не затрагивает законность обработки до отзыва;",
    "termlegal.privacy.s10.li6": "подать жалобу в орган по защите персональных данных (в России — Роскомнадзор, в странах ЕС и Великобритании — национальный надзорный орган).",
    "termlegal.privacy.s10.p2":
      "Мы обрабатываем данные в соответствии с законодательством России о персональных данных (152-ФЗ) и стараемся обеспечить права, сходные с теми, что дают GDPR и UK GDPR. Это не означает формальной сертификации или соответствия каждому местному закону. Чтобы воспользоваться правами, напишите Оператору (раздел 13); мы можем попросить подтвердить, что запрос исходит от владельца аккаунта.",

    "termlegal.privacy.s11.h": "11. Дети",
    "termlegal.privacy.s11.p1":
      "Терминал не предназначен для лиц младше 18 лет, и мы сознательно не обрабатываем их данные. Если вы считаете, что аккаунт создан несовершеннолетним, сообщите нам: мы его удалим.",

    "termlegal.privacy.s12.h": "12. Изменения политики",
    "termlegal.privacy.s12.p1":
      "Мы можем обновлять эту политику. Актуальная версия всегда на этой странице, дата вступления в силу указана вверху; о существенных изменениях мы сообщим в Терминале или по e-mail. Если вы продолжаете пользоваться Терминалом после изменений, вы с ними согласны.",

    "termlegal.privacy.s13.h": "13. Контакты",
    "termlegal.privacy.s13.email":
      "По вопросам обработки данных, а также для запросов на доступ, исправление и удаление данных пишите Оператору (физическое лицо, бренд «Neurotrader») на {email}.",
    "termlegal.privacy.s13.form":
      "По вопросам обработки данных, а также для запросов на доступ, исправление и удаление данных свяжитесь с Оператором (физическое лицо, бренд «Neurotrader») через форму обратной связи на {url}.",

    // ---------- Terms ----------
    "termlegal.terms.title": "Условия использования FOMO Terminal",
    "termlegal.terms.effective": "Действует с 06.10.2026",
    "termlegal.terms.box.title": "Не является инвестиционной рекомендацией",
    "termlegal.terms.box.li1":
      "FOMO Terminal — информационный инструмент: графики, индикаторы, календарь и алерты. Ничто в нём не является индивидуальной инвестиционной рекомендацией, предложением купить или продать что-либо или торговым сигналом.",
    "termlegal.terms.box.li2":
      "Торговля акциями, фьючерсами, криптовалютами, валютой и другими финансовыми инструментами связана с высоким риском потерь. Вы можете потерять всё вложенное, а при торговле с плечом и больше.",
    "termlegal.terms.box.li3": "Прошлые результаты не гарантируют будущих. Индикаторы и инструменты анализа не обещают прибыли.",
    "termlegal.terms.box.li4":
      "Данные могут приходить с задержкой или содержать ошибки: перед сделкой сверяйтесь с данными вашего брокера. Решения вы принимаете сами и сами за них отвечаете.",
    "termlegal.terms.box.more": "Подробности: разделы 5, 6 и 8 ниже.",

    "termlegal.terms.s1.h": "1. Принятие условий",
    "termlegal.terms.s1.link": "Политику конфиденциальности",
    "termlegal.terms.s1.p1":
      "Эти условия регулируют использование FOMO Terminal (сайт terminal.fomo.spot, приложение для Android, установщик для Windows; далее — «Терминал») между вами и его оператором — физическим лицом, работающим под брендом «Neurotrader» (далее — «Оператор»). Регистрируясь или пользуясь Терминалом, вы принимаете эти условия и {privacy}. Если вы не согласны, не пользуйтесь Терминалом.",
    "termlegal.terms.s1.p2": "Терминал — отдельный сервис со своим аккаунтом. Условия сайта fomo.spot на него не распространяются.",

    "termlegal.terms.s2.h": "2. Что такое Терминал",
    "termlegal.terms.s2.p1":
      "Терминал — веб-версия и приложения для Android и Windows для просмотра рынков: графики с индикаторами и инструментами рисования, алерты по цене и по линиям, экономический календарь с напоминаниями, список наблюдения. Рыночные данные приходят от МосБиржи, Bybit, FMP (фьючерсы США NYMEX, COMEX, CME, CBOT, ICE) и источников данных по форексу.",
    "termlegal.terms.s2.p2":
      "Терминал не является брокером, биржей или организатором торгов: через него нельзя совершать сделки и выставлять заявки, мы не храним ваши деньги и ценные бумаги и не принимаем платежи. Для работы нужна регистрация.",
    "termlegal.terms.s2.p3":
      "Сейчас платежи в Терминале не предусмотрены. Оператор может изменить это, как и другие условия, предупредив заранее (раздел 11).",

    "termlegal.terms.s3.h": "3. Аккаунт и безопасность",
    "termlegal.terms.s3.li1": "Регистрироваться могут лица от 18 лет; на одного человека один аккаунт.",
    "termlegal.terms.s3.li2": "Укажите действующий e-mail: на него приходят коды подтверждения и восстановление пароля.",
    "termlegal.terms.s3.li3": "Храните пароль в тайне: за действия в вашем аккаунте отвечаете вы.",
    "termlegal.terms.s3.li4":
      "Вход сохраняется в cookie Терминала (до 30 дней). На чужих устройствах выходите из аккаунта; при смене пароля прежние сессии прекращаются.",
    "termlegal.terms.s3.li5": "Если подозреваете, что к аккаунту получили доступ посторонние, смените пароль и сообщите Оператору (раздел 13).",

    "termlegal.terms.s4.h": "4. Допустимое использование",
    "termlegal.terms.s4.p1": "Нельзя:",
    "termlegal.terms.s4.li1":
      "автоматически собирать данные Терминала (парсинг, скрейпинг, боты), создавать чрезмерную нагрузку на сайт и его API, обходить ограничения частоты запросов;",
    "termlegal.terms.s4.li2":
      "перепродавать, публиковать и передавать третьим лицам рыночные данные, котировки, календарь и новости из Терминала: на эти данные действуют условия бирж и поставщиков данных, использовать их можно только для личных целей;",
    "termlegal.terms.s4.li3": "получать доступ к чужим аккаунтам, к данным других пользователей и к закрытым частям сервиса;",
    "termlegal.terms.s4.li4": "нарушать работу Терминала, загружать вредоносный код, искать уязвимости способами, которые вредят сервису или пользователям (о найденной уязвимости сообщите Оператору);",
    "termlegal.terms.s4.li5": "создавать несколько аккаунтов, чтобы обойти ограничения (например, лимит активных алертов);",
    "termlegal.terms.s4.li6": "использовать Терминал в целях, нарушающих закон или чужие права.",
    "termlegal.terms.s4.p2": "При нарушении этих правил мы можем ограничить или заблокировать доступ (раздел 10).",

    "termlegal.terms.s5.h": "5. Данные и сторонние материалы",
    "termlegal.terms.s5.p1":
      "Рыночные данные, новости и данные экономического календаря поступают от сторонних источников. Оператор их не создаёт и не контролирует и не отвечает за их точность, полноту и своевременность:",
    "termlegal.terms.s5.li1":
      "данные могут приходить с задержкой: открытые данные МосБиржи примерно на 15 минут, если не подключён источник данных; на графике есть соответствующая отметка;",
    "termlegal.terms.s5.li2":
      "фьючерсы США (NYMEX, COMEX, CME, CBOT, ICE) приходят от стороннего поставщика как непрерывный ряд ближайшего контракта; реальное время не гарантируется, значения могут отличаться от котировок вашего брокера;",
    "termlegal.terms.s5.li3": "в данных бывают пропуски, ошибки и неверные значения; события календаря переносятся и пересматриваются;",
    "termlegal.terms.s5.li4": "значения индикаторов вычисляет Терминал, они могут отличаться от расчётов других программ;",
    "termlegal.terms.s5.li5": "названия бирж, компаний и торговые марки принадлежат их владельцам и используются только для обозначения инструментов.",
    "termlegal.terms.s5.p2": "Перед принятием решений проверяйте данные у брокера или на сайте биржи.",

    "termlegal.terms.s6.h": "6. Не инвестиционная рекомендация и риски",
    "termlegal.terms.s6.p1":
      "Оператор не является инвестиционным советником, брокером или управляющим, не даёт персональных рекомендаций и не гарантирует прибыль. Графики, индикаторы, паттерны и другие инструменты анализа носят информационный характер и не являются сигналом к сделке.",
    "termlegal.terms.s6.p2":
      "Торговля финансовыми инструментами рискованна, прошлые результаты не гарантируют будущих. Вы принимаете торговые решения самостоятельно и несёте за них полную ответственность. При сомнениях проконсультируйтесь с лицензированным финансовым советником.",
    "termlegal.terms.s6.p3":
      "Алерты и напоминания доставляются через сторонние сервисы (почта, push, мессенджеры) и могут опоздать или не дойти. Не используйте их как единственную защиту позиции: стоп-приказы выставляйте у брокера.",
    "termlegal.terms.s6.p4":
      "Проверьте, не ограничено ли для вас законом вашей страны обращение с отдельными инструментами (например, криптовалютами или иностранными фьючерсами): за это отвечаете вы.",

    "termlegal.terms.s7.h": "7. Доступность Терминала",
    "termlegal.terms.s7.p1":
      "Терминал предоставляется «как есть» и «как доступен». Мы стараемся, чтобы он работал стабильно, но не гарантируем бесперебойной работы, отсутствия ошибок и доступности в любое время: возможны сбои, технические работы и отказы сторонних сервисов.",
    "termlegal.terms.s7.p2":
      "Оператор вправе менять и прекращать отдельные функции, рынки и источники данных. Приложения для Android (APK) и Windows скачивайте только с сайта Терминала.",

    "termlegal.terms.s8.h": "8. Ограничение ответственности",
    "termlegal.terms.s8.p1":
      "В пределах, допускаемых законом, Оператор не отвечает за убытки от торговых решений, упущенную выгоду, косвенный ущерб и потерю данных, за ошибки, задержки и пропуски в данных, недоставленные или опоздавшие уведомления, перебои в работе и действия сторонних сервисов.",
    "termlegal.terms.s8.p2":
      "Ничто в этих условиях не исключает и не ограничивает ответственность, которую по закону нельзя исключить или ограничить, и не лишает вас прав потребителя, которые не могут быть изменены соглашением.",

    "termlegal.terms.s9.h": "9. Интеллектуальная собственность",
    "termlegal.terms.s9.p1":
      "Программный код, дизайн, тексты и оформление Терминала, а также названия «FOMO Terminal» и «Neurotrader» принадлежат Оператору или его лицензиарам. Вам предоставляется личное, неисключительное и непередаваемое право пользоваться Терминалом на этих условиях. Копировать, распространять Терминал и использовать его для создания конкурирующего сервиса нельзя, кроме случаев, когда это разрешает закон.",
    "termlegal.terms.s9.p2":
      "Ваши списки наблюдения, раскладки графиков, рисунки и другие настройки остаются вашими; вы разрешаете хранить и обрабатывать их, чтобы Терминал работал. Данные бирж и поставщиков принадлежат им.",

    "termlegal.terms.s10.h": "10. Прекращение и блокировка",
    "termlegal.terms.s10.p1":
      "Вы можете перестать пользоваться Терминалом в любой момент. Чтобы удалить аккаунт, напишите Оператору (раздел 13); порядок описан в Политике конфиденциальности.",
    "termlegal.terms.s10.p2":
      "Оператор может приостановить или заблокировать аккаунт при нарушении условий, угрозе безопасности или по требованию закона, а также прекратить работу Терминала. Если это возможно, мы предупредим заранее. После закрытия аккаунта данные удаляются по Политике конфиденциальности.",

    "termlegal.terms.s11.h": "11. Изменения условий",
    "termlegal.terms.s11.p1":
      "Оператор может менять эти условия, в том числе вводить оплату отдельных функций. Новая версия публикуется на этой странице, дата вступления в силу указана вверху; о существенных изменениях мы заранее сообщим в Терминале или по e-mail. Если вы продолжаете пользоваться Терминалом после вступления изменений в силу, вы принимаете новую версию; если не согласны, прекратите им пользоваться.",

    "termlegal.terms.s12.h": "12. Применимое право",
    "termlegal.terms.s12.p1":
      "К этим условиям применяется право Российской Федерации, за исключением случаев, когда императивные нормы права страны вашего проживания, защищающие потребителей, требуют иного: такие нормы остаются за вами, и эти условия не могут их ограничить. Мы постараемся решать споры путём переговоров; если не получится, то в порядке, предусмотренном применимым законом.",

    "termlegal.terms.s13.h": "13. Контакты",
    "termlegal.terms.s13.email": "Вопросы по условиям, жалобы и запросы направляйте Оператору (физическое лицо, бренд «Neurotrader») на {email}.",
    "termlegal.terms.s13.form":
      "Вопросы по условиям, жалобы и запросы направляйте Оператору (физическое лицо, бренд «Neurotrader») через форму обратной связи на {url}.",
  },

  en: {
    "termlegal.note": "The Russian version is the original; this translation is provided for convenience.",
    "termlegal.seo.privacy.title": "Privacy Policy",
    "termlegal.seo.privacy.description": "What data the FOMO Terminal trading terminal processes, why, who receives it and how you can control it.",
    "termlegal.seo.terms.title": "Terms of Use",
    "termlegal.seo.terms.description": "Terms of use of the FOMO Terminal trading terminal: account, acceptable use, market data, risks and liability.",
    "termlegal.cookie.text": "The terminal uses only necessary cookies: to sign you in and remember your language. There is no advertising or analytics. By continuing to use FOMO Terminal, you agree to the",
    "termlegal.register.disclaimer": ". I understand that the terminal is not investment advice and that trading financial instruments involves a risk of loss.",

    // ---------- Privacy ----------
    "termlegal.privacy.title": "FOMO Terminal Privacy Policy",
    "termlegal.privacy.effective": "Effective from 6 October 2026 (06.10.2026)",

    "termlegal.privacy.s1.h": "1. What this document is about",
    "termlegal.privacy.s1.p1":
      "This policy describes what personal data FOMO Terminal (the terminal.fomo.spot website, the Android app and the Windows installer; the “Terminal”) processes, why, and what you can do about it. The Terminal has its own accounts and its own database: your fomo.spot account and data do not apply here and are not shared.",
    "termlegal.privacy.s1.p2":
      "The Terminal is operated by a private individual under the brand “Neurotrader” (the “Operator”). How to contact the Operator is in section 13. By signing up you confirm that you have read this policy and the Terms of Use.",

    "termlegal.privacy.s2.h": "2. What data we process",
    "termlegal.privacy.s2.p1": "Only what the Terminal needs to work:",
    "termlegal.privacy.s2.li1":
      "account: e-mail address, password (stored only as a bcrypt hash, we do not know the password itself), display name, optionally first name, last name and a profile photo, account role and status, interface language and theme;",
    "termlegal.privacy.s2.li2":
      "your terminal settings: watchlists, chart layouts, indicators and their parameters, drawn lines and shapes, templates. They are saved in your account so that they are the same on every device;",
    "termlegal.privacy.s2.li3": "alerts and reminders: conditions of price and line alerts, economic calendar reminders, time and status of triggering;",
    "termlegal.privacy.s2.li4":
      "data for delivering notifications, if you connect them: e-mail; the browser subscription address for web push; the Android device token (Firebase Cloud Messaging), device name and app version; the Telegram chat ID and, if you connect your own bot, that bot's token; a phone number for WhatsApp; conversation IDs in Max and VK; a webhook URL and its signing key;",
    "termlegal.privacy.s2.li5": "one-time confirmation codes (sign-up, e-mail change, password reset): they are valid for 15 minutes and we count wrong attempts;",
    "termlegal.privacy.s2.li6":
      "technical data: IP address and user agent of the browser or app in server logs, request rate-limit counters (protection against password guessing and overload), error records;",
    "termlegal.privacy.s2.li7": "cookies and browser local storage: see section 7.",
    "termlegal.privacy.s2.p2": "We do not ask for payment or ID document data, we do not connect to your brokerage account and we do not see your trades.",

    "termlegal.privacy.s3.h": "3. Why and on what basis",
    "termlegal.privacy.s3.p1": "Data is processed to:",
    "termlegal.privacy.s3.li1": "create your account and sign you in, store your settings, alerts and reminders: this is necessary to run the Terminal under the Terms of Use;",
    "termlegal.privacy.s3.li2": "deliver the notifications you turned on: based on your consent, which you can withdraw by switching the delivery method off in “Profile → Notification settings”;",
    "termlegal.privacy.s3.li3": "keep the service secure and prevent abuse (rate limiting, protection against password guessing, error analysis): our legitimate interest;",
    "termlegal.privacy.s3.li4": "send service messages about the Terminal (codes, important changes) and answer your requests;",
    "termlegal.privacy.s3.li5": "comply with the law.",

    "termlegal.privacy.s4.h": "4. Advertising, analytics and sale of data",
    "termlegal.privacy.s4.p1":
      "The Terminal has no advertising or analytics trackers: Yandex Metrica, Google Analytics, social network pixels and similar services are not connected. Data is not used for advertising or profiling.",
    "termlegal.privacy.s4.p2":
      "We do not sell or rent personal data. If the set of processors changes (for example, analytics is added), we will update this policy before such processing starts.",

    "termlegal.privacy.s5.h": "5. Who receives your data",
    "termlegal.privacy.s5.p1": "Data goes only to those without whom a feature would not work, and only as much as needed:",
    "termlegal.privacy.s5.li1": "the hosting provider Timeweb: the Terminal and its database run on its servers, which are located in Russia;",
    "termlegal.privacy.s5.li2":
      "Resend (e-mail delivery service): your e-mail address and the text of the message: confirmation codes, messages about password and e-mail changes, notifications if e-mail is selected;",
    "termlegal.privacy.s5.li3":
      "Google (Firebase Cloud Messaging): the device token and the notification text for Android push; browser web push is delivered through your browser's push service;",
    "termlegal.privacy.s5.li4":
      "Telegram, WhatsApp (Meta), Max, VK: the recipient ID and the notification text, only if you connected that delivery method yourself; a webhook receives notifications at the address you specify;",
    "termlegal.privacy.s5.li5":
      "market data sources (Moscow Exchange, Bybit, FMP and others): quote requests are normally made by the Terminal's server, and your account data is not passed to them;",
    "termlegal.privacy.s5.li6": "public authorities: only on a justified request provided for by law.",
    "termlegal.privacy.s5.p2": "Each of these services processes data under its own rules. Whether to connect Telegram, WhatsApp, Max, VK or a webhook is up to you.",

    "termlegal.privacy.s6.h": "6. Where data is stored",
    "termlegal.privacy.s6.p1":
      "The Terminal's database and servers are located in Russia (Timeweb). To make e-mail, push and the services you connect work, some data (e-mail address, device token, recipient ID and notification text) may be transferred outside Russia, to the countries where Resend, Google, Telegram and other processors are located. The level of data protection there may differ from that in your country.",
    "termlegal.privacy.s6.p2":
      "E-mail is needed to sign up, so passing your e-mail address to the mail service is unavoidable; other transfers depend on the notification methods you turn on.",

    "termlegal.privacy.s7.h": "7. Cookies and local storage",
    "termlegal.privacy.s7.p1": "The Terminal uses only necessary cookies. They are tied to a single host, with no domain shared with other sites:",
    "termlegal.privacy.s7.li1":
      "terminal.session-token (over https with the prefix __Secure-), terminal.callback-url and terminal.csrf-token (with the prefix __Host-): signing in and form protection; the session lasts up to 30 days;",
    "termlegal.privacy.s7.li2": "NEXT_LOCALE: the chosen interface language, kept for up to a year.",
    "termlegal.privacy.s7.p2":
      "The browser's localStorage holds settings on this device: the theme (fomo-theme), a mark that you have read the cookie notice, chart, indicator and calendar settings, a “remember me” mark. They live on your device and are cleared with the browser's tools; some chart settings are also synchronised with your account (section 2).",
    "termlegal.privacy.s7.p3": "There are no advertising or analytics cookies. If you block cookies, you will not be able to sign in.",

    "termlegal.privacy.s8.h": "8. Retention and deletion",
    "termlegal.privacy.s8.p1":
      "Account data and your settings are kept while the account exists. When the account is deleted, the data tied to it (settings, alerts, reminders, notification methods, device tokens) is deleted from the database.",
    "termlegal.privacy.s8.p2":
      "One-time confirmation codes are valid for 15 minutes. Server logs are kept for a limited time needed for security and error analysis. If the hosting provider or we keep backups, deleted data may remain in them until they are rotated.",
    "termlegal.privacy.s8.p3":
      "There is no self-service account deletion in the app yet: to delete your account, write to the Operator (section 13) from the address on the account. We will delete the data within the period set by applicable law, usually no later than 30 days. You can switch off individual notification methods, browser subscriptions and device tokens in “Profile → Notification settings”, and change your e-mail and password on the “Security” tab.",

    "termlegal.privacy.s9.h": "9. Security",
    "termlegal.privacy.s9.p1":
      "Passwords are stored as a bcrypt hash, the connection to the site is protected by HTTPS, the tokens of your own bots and webhook keys are not returned to the browser, and changing the password ends earlier sessions. We restrict access to data but cannot guarantee absolute security: use a unique password and do not stay signed in on devices that are not yours.",

    "termlegal.privacy.s10.h": "10. Your rights",
    "termlegal.privacy.s10.p1": "Depending on the law of your country, you may have the right to:",
    "termlegal.privacy.s10.li1": "get confirmation that we process your data and a copy of it;",
    "termlegal.privacy.s10.li2": "correct inaccurate data (you can change your name, e-mail and password in the profile);",
    "termlegal.privacy.s10.li3": "ask for deletion of your data or restriction of processing, and object to processing;",
    "termlegal.privacy.s10.li4": "receive your data in a portable form, where applicable;",
    "termlegal.privacy.s10.li5": "withdraw consent at any time; this does not affect the lawfulness of processing before withdrawal;",
    "termlegal.privacy.s10.li6": "lodge a complaint with a data protection authority (in Russia, Roskomnadzor; in the EU and the UK, your national supervisory authority).",
    "termlegal.privacy.s10.p2":
      "We process data in line with Russian personal data law (Federal Law No. 152-FZ) and try to provide rights similar to those under the GDPR and UK GDPR. This does not mean formal certification or compliance with every local law. To use your rights, write to the Operator (section 13); we may ask you to confirm that the request comes from the account owner.",

    "termlegal.privacy.s11.h": "11. Children",
    "termlegal.privacy.s11.p1":
      "The Terminal is not intended for anyone under 18 and we knowingly do not process their data. If you believe an account was created by a minor, tell us and we will delete it.",

    "termlegal.privacy.s12.h": "12. Changes to this policy",
    "termlegal.privacy.s12.p1":
      "We may update this policy. The current version is always on this page with the effective date at the top; we will announce material changes in the Terminal or by e-mail. If you keep using the Terminal after the changes, you agree to them.",

    "termlegal.privacy.s13.h": "13. Contact",
    "termlegal.privacy.s13.email":
      "For questions about data processing and for requests to access, correct or delete your data, write to the Operator (a private individual, brand “Neurotrader”) at {email}.",
    "termlegal.privacy.s13.form":
      "For questions about data processing and for requests to access, correct or delete your data, contact the Operator (a private individual, brand “Neurotrader”) through the feedback form at {url}.",

    // ---------- Terms ----------
    "termlegal.terms.title": "FOMO Terminal Terms of Use",
    "termlegal.terms.effective": "Effective from 6 October 2026 (06.10.2026)",
    "termlegal.terms.box.title": "Not investment advice",
    "termlegal.terms.box.li1":
      "FOMO Terminal is an informational tool: charts, indicators, a calendar and alerts. Nothing in it is an individual investment recommendation, an offer to buy or sell anything, or a trading signal.",
    "termlegal.terms.box.li2":
      "Trading stocks, futures, crypto, currencies and other financial instruments involves a high risk of loss. You can lose everything you invest, and when trading with leverage even more.",
    "termlegal.terms.box.li3": "Past performance does not guarantee future results. Indicators and analysis tools do not promise profit.",
    "termlegal.terms.box.li4":
      "Data may be delayed or contain errors: check your broker's data before you trade. The decisions are yours and you are responsible for them.",
    "termlegal.terms.box.more": "Details: sections 5, 6 and 8 below.",

    "termlegal.terms.s1.h": "1. Acceptance of the terms",
    "termlegal.terms.s1.link": "Privacy Policy",
    "termlegal.terms.s1.p1":
      "These terms govern the use of FOMO Terminal (the terminal.fomo.spot website, the Android app and the Windows installer; the “Terminal”) between you and its operator, a private individual acting under the brand “Neurotrader” (the “Operator”). By signing up or using the Terminal you accept these terms and the {privacy}. If you do not agree, do not use the Terminal.",
    "termlegal.terms.s1.p2": "The Terminal is a separate service with its own account. The terms of the fomo.spot website do not apply to it.",

    "termlegal.terms.s2.h": "2. What the Terminal is",
    "termlegal.terms.s2.p1":
      "The Terminal is a web version and Android and Windows apps for viewing markets: charts with indicators and drawing tools, price and line alerts, an economic calendar with reminders, a watchlist. Market data comes from Moscow Exchange, Bybit, FMP (US futures NYMEX, COMEX, CME, CBOT, ICE) and forex data sources.",
    "termlegal.terms.s2.p2":
      "The Terminal is not a broker, an exchange or a trading venue: you cannot trade or place orders through it, we do not hold your money or securities and we do not accept payments. Signing up is required to use it.",
    "termlegal.terms.s2.p3": "At present there are no payments in the Terminal. The Operator may change this, like any other term, with prior notice (section 11).",

    "termlegal.terms.s3.h": "3. Account and security",
    "termlegal.terms.s3.li1": "You must be 18 or older to sign up; one account per person.",
    "termlegal.terms.s3.li2": "Give a working e-mail address: confirmation codes and password recovery are sent there.",
    "termlegal.terms.s3.li3": "Keep your password secret: you are responsible for what happens in your account.",
    "termlegal.terms.s3.li4": "Your sign-in is kept in the Terminal's cookie (up to 30 days). Sign out on devices that are not yours; changing the password ends earlier sessions.",
    "termlegal.terms.s3.li5": "If you suspect someone else got access to your account, change the password and tell the Operator (section 13).",

    "termlegal.terms.s4.h": "4. Acceptable use",
    "termlegal.terms.s4.p1": "You must not:",
    "termlegal.terms.s4.li1": "collect Terminal data automatically (parsing, scraping, bots), put excessive load on the site and its API, or get around request rate limits;",
    "termlegal.terms.s4.li2":
      "resell, publish or pass to third parties the market data, quotes, calendar and news from the Terminal: the terms of the exchanges and data providers apply to this data, and you may use it for personal purposes only;",
    "termlegal.terms.s4.li3": "access other people's accounts, other users' data or closed parts of the service;",
    "termlegal.terms.s4.li4": "disrupt the Terminal, upload malicious code, or look for vulnerabilities in ways that harm the service or users (report any vulnerability you find to the Operator);",
    "termlegal.terms.s4.li5": "create several accounts to get around limits (for example, the limit of active alerts);",
    "termlegal.terms.s4.li6": "use the Terminal for purposes that break the law or other people's rights.",
    "termlegal.terms.s4.p2": "If you break these rules, we may restrict or block your access (section 10).",

    "termlegal.terms.s5.h": "5. Data and third-party content",
    "termlegal.terms.s5.p1":
      "Market data, news and economic calendar data come from third-party sources. The Operator does not create or control them and is not responsible for their accuracy, completeness or timeliness:",
    "termlegal.terms.s5.li1":
      "data may be delayed: open Moscow Exchange data by about 15 minutes unless a data source is connected; the chart carries a label for this;",
    "termlegal.terms.s5.li2":
      "US futures (NYMEX, COMEX, CME, CBOT, ICE) come from a third-party provider as a continuous front-month series; real time is not guaranteed, and values may differ from your broker's quotes;",
    "termlegal.terms.s5.li3": "data can have gaps, errors and wrong values; calendar events get moved and revised;",
    "termlegal.terms.s5.li4": "indicator values are calculated by the Terminal and may differ from other programs' calculations;",
    "termlegal.terms.s5.li5": "names of exchanges, companies and trademarks belong to their owners and are used only to identify instruments.",
    "termlegal.terms.s5.p2": "Check the data with your broker or the exchange's website before you make decisions.",

    "termlegal.terms.s6.h": "6. Not investment advice, and risks",
    "termlegal.terms.s6.p1":
      "The Operator is not an investment adviser, broker or manager, gives no personal recommendations and does not guarantee profit. Charts, indicators, patterns and other analysis tools are informational and are not a signal to trade.",
    "termlegal.terms.s6.p2":
      "Trading financial instruments is risky and past performance does not guarantee future results. You make trading decisions on your own and are fully responsible for them. If in doubt, consult a licensed financial adviser.",
    "termlegal.terms.s6.p3":
      "Alerts and reminders are delivered through third-party services (e-mail, push, messengers) and may be late or not arrive. Do not use them as the only protection of a position: place stop orders with your broker.",
    "termlegal.terms.s6.p4":
      "Check whether the law of your country restricts you from dealing in certain instruments (for example crypto or foreign futures): that is your responsibility.",

    "termlegal.terms.s7.h": "7. Availability of the Terminal",
    "termlegal.terms.s7.p1":
      "The Terminal is provided “as is” and “as available”. We try to keep it running reliably but do not guarantee uninterrupted operation, absence of errors or availability at any time: outages, maintenance and failures of third-party services are possible.",
    "termlegal.terms.s7.p2": "The Operator may change or discontinue individual features, markets and data sources. Download the Android (APK) and Windows apps only from the Terminal's website.",

    "termlegal.terms.s8.h": "8. Limitation of liability",
    "termlegal.terms.s8.p1":
      "To the extent permitted by law, the Operator is not liable for losses from trading decisions, lost profit, indirect damage and loss of data, for errors, delays and gaps in data, notifications that are late or not delivered, interruptions, or the actions of third-party services.",
    "termlegal.terms.s8.p2":
      "Nothing in these terms excludes or limits liability that cannot be excluded or limited by law, or takes away consumer rights that cannot be changed by agreement.",

    "termlegal.terms.s9.h": "9. Intellectual property",
    "termlegal.terms.s9.p1":
      "The Terminal's software code, design, texts and look, and the names “FOMO Terminal” and “Neurotrader”, belong to the Operator or its licensors. You get a personal, non-exclusive, non-transferable right to use the Terminal on these terms. You may not copy or distribute the Terminal or use it to build a competing service, except where the law allows it.",
    "termlegal.terms.s9.p2":
      "Your watchlists, chart layouts, drawings and other settings remain yours; you allow us to store and process them so that the Terminal works. Data of exchanges and providers belongs to them.",

    "termlegal.terms.s10.h": "10. Termination and blocking",
    "termlegal.terms.s10.p1": "You can stop using the Terminal at any time. To delete your account, write to the Operator (section 13); the procedure is described in the Privacy Policy.",
    "termlegal.terms.s10.p2":
      "The Operator may suspend or block an account for a breach of the terms, a security threat or a legal requirement, and may shut the Terminal down. Where possible we will warn you in advance. After an account is closed, its data is deleted under the Privacy Policy.",

    "termlegal.terms.s11.h": "11. Changes to the terms",
    "termlegal.terms.s11.p1":
      "The Operator may change these terms, including by introducing payment for some features. The new version is published on this page with the effective date at the top; we will announce material changes in advance in the Terminal or by e-mail. If you keep using the Terminal after the changes take effect, you accept the new version; if you do not agree, stop using it.",

    "termlegal.terms.s12.h": "12. Governing law",
    "termlegal.terms.s12.p1":
      "These terms are governed by the law of the Russian Federation, except where mandatory consumer-protection rules of the country where you live require otherwise: such rules stay with you and these terms cannot limit them. We will try to settle disputes by negotiation; if that fails, in the manner provided by applicable law.",

    "termlegal.terms.s13.h": "13. Contact",
    "termlegal.terms.s13.email": "Send questions about these terms, complaints and requests to the Operator (a private individual, brand “Neurotrader”) at {email}.",
    "termlegal.terms.s13.form":
      "Send questions about these terms, complaints and requests to the Operator (a private individual, brand “Neurotrader”) through the feedback form at {url}.",
  },

  cn: {
    "termlegal.note": "俄文版为原文，本译文仅为方便阅读而提供。",
    "termlegal.seo.privacy.title": "隐私政策",
    "termlegal.seo.privacy.description": "FOMO Terminal 交易终端处理哪些数据、原因、数据的接收方以及您如何管理这些数据。",
    "termlegal.seo.terms.title": "使用条款",
    "termlegal.seo.terms.description": "FOMO Terminal 交易终端的使用条款：账户、可接受的使用、市场数据、风险和责任。",
    "termlegal.cookie.text": "本终端仅使用必要的 Cookie，用于账户登录和记住语言，没有广告和统计分析。继续使用 FOMO Terminal 即表示您同意",
    "termlegal.register.disclaimer": "。我了解本终端不构成投资建议，金融工具交易存在亏损风险。",

    // ---------- Privacy ----------
    "termlegal.privacy.title": "FOMO Terminal 隐私政策",
    "termlegal.privacy.effective": "自 2026年10月6日（06.10.2026）起生效",

    "termlegal.privacy.s1.h": "1. 本文件的内容",
    "termlegal.privacy.s1.p1":
      "本政策说明 FOMO Terminal（terminal.fomo.spot 网站、Android 应用和 Windows 安装程序，以下简称“终端”）处理哪些个人数据、处理原因，以及您可以如何处理这些数据。终端拥有独立的账户和独立的数据库：您在 fomo.spot 的账户和数据在此无效，也不会被共享。",
    "termlegal.privacy.s1.p2":
      "终端的运营者是以“Neurotrader”品牌开展活动的自然人（以下简称“运营者”）。联系方式见第 13 节。注册即表示您已阅读本政策和《使用条款》。",

    "termlegal.privacy.s2.h": "2. 我们处理哪些数据",
    "termlegal.privacy.s2.p1": "仅限终端运行所需的数据：",
    "termlegal.privacy.s2.li1": "账户：电子邮件地址、密码（仅以 bcrypt 哈希形式保存，我们不知道密码本身）、显示名称，以及您自愿提供的姓名和头像、账户角色和状态、界面语言和主题；",
    "termlegal.privacy.s2.li2": "您的终端设置：自选列表、图表布局、指标及其参数、绘制的线条和图形、模板。它们保存在账户中，以便在所有设备上保持一致；",
    "termlegal.privacy.s2.li3": "提醒：价格提醒和线条提醒的条件、经济日历提醒、触发时间和状态；",
    "termlegal.privacy.s2.li4":
      "若您连接通知方式，则包括用于发送通知的数据：电子邮件；浏览器 Web Push 订阅地址；Android 设备令牌（Firebase Cloud Messaging）、设备名称和应用版本；Telegram 聊天 ID，若您连接自己的机器人，还包括该机器人的令牌；WhatsApp 手机号码；Max 和 VK 的对话标识；Webhook 地址及其签名密钥；",
    "termlegal.privacy.s2.li5": "一次性验证码（注册、更换电子邮件、重置密码）：有效期 15 分钟，我们会记录输错的次数；",
    "termlegal.privacy.s2.li6": "技术数据：服务器日志中的浏览器或应用的 IP 地址和 user-agent、请求频率限制计数器（防止猜测密码和过载）、错误记录；",
    "termlegal.privacy.s2.li7": "Cookie 和浏览器本地存储：见第 7 节。",
    "termlegal.privacy.s2.p2": "我们不索取支付信息和身份证件数据，不连接您的券商账户，也看不到您的交易。",

    "termlegal.privacy.s3.h": "3. 目的和依据",
    "termlegal.privacy.s3.p1": "处理数据的目的是：",
    "termlegal.privacy.s3.li1": "创建账户和登录，保存您的设置、提醒和日历提醒：这是按《使用条款》运行终端所必需的；",
    "termlegal.privacy.s3.li2": "发送您开启的通知：基于您的同意，您可以在“个人资料 → 通知设置”中关闭相应方式以撤回同意；",
    "termlegal.privacy.s3.li3": "保障安全和防止滥用（请求频率限制、防止猜测密码、分析错误）：这是我们的合法利益；",
    "termlegal.privacy.s3.li4": "发送与终端运行有关的服务消息（验证码、重要变更）并答复您的咨询；",
    "termlegal.privacy.s3.li5": "履行法律要求。",

    "termlegal.privacy.s4.h": "4. 广告、统计分析和数据出售",
    "termlegal.privacy.s4.p1": "终端没有广告和统计分析跟踪器：未接入 Yandex Metrica、Google Analytics、社交网络像素等类似服务。数据不用于广告或用户画像。",
    "termlegal.privacy.s4.p2": "我们不出售也不出租个人数据。如果数据处理方发生变化（例如增加统计分析），我们会在开始此类处理之前更新本政策。",

    "termlegal.privacy.s5.h": "5. 数据的接收方",
    "termlegal.privacy.s5.p1": "只有缺少就无法实现相应功能的方才会收到数据，且仅限必要范围：",
    "termlegal.privacy.s5.li1": "托管服务商 Timeweb：终端和数据库运行在其服务器上，服务器位于俄罗斯；",
    "termlegal.privacy.s5.li2": "Resend（邮件发送服务）：您的电子邮件地址和邮件内容：验证码、修改密码和电子邮件的通知邮件，以及选择电子邮件方式时的通知；",
    "termlegal.privacy.s5.li3": "Google（Firebase Cloud Messaging）：用于 Android 推送的设备令牌和通知文本；浏览器 Web Push 通过您浏览器的推送服务发送；",
    "termlegal.privacy.s5.li4": "Telegram、WhatsApp（Meta）、Max、VK：接收方标识和通知文本，仅在您自己连接了该方式时；Webhook 会向您指定的地址发送通知；",
    "termlegal.privacy.s5.li5": "市场数据来源（莫斯科交易所、Bybit、FMP 等）：行情请求通常由终端服务器发出，不会向它们传递您的账户数据；",
    "termlegal.privacy.s5.li6": "国家机关：仅在法律规定的有正当理由的要求下。",
    "termlegal.privacy.s5.p2": "这些服务各自按其自身规则处理数据。是否连接 Telegram、WhatsApp、Max、VK 或 Webhook 由您决定。",

    "termlegal.privacy.s6.h": "6. 数据存储地点",
    "termlegal.privacy.s6.p1":
      "终端的数据库和服务器位于俄罗斯（Timeweb）。为使电子邮件、推送和您连接的服务正常工作，部分数据（电子邮件地址、设备令牌、接收方标识和通知文本）可能被传输到俄罗斯境外，即 Resend、Google、Telegram 及其他数据处理方所在的国家。那里的数据保护水平可能与您所在国家不同。",
    "termlegal.privacy.s6.p2": "注册需要电子邮件，因此必然要把电子邮件地址交给邮件服务；其他传输取决于您开启的通知方式。",

    "termlegal.privacy.s7.h": "7. Cookie 和本地存储",
    "termlegal.privacy.s7.p1": "终端仅使用必要的 Cookie。它们只属于单一主机，不与其他网站共用域名：",
    "termlegal.privacy.s7.li1": "terminal.session-token（https 下带 __Secure- 前缀）、terminal.callback-url 和 terminal.csrf-token（带 __Host- 前缀）：用于账户登录和表单保护；会话最长 30 天；",
    "termlegal.privacy.s7.li2": "NEXT_LOCALE：所选界面语言，最长保存一年。",
    "termlegal.privacy.s7.p2":
      "浏览器的 localStorage 保存此设备上的设置：主题（fomo-theme）、您已阅读 Cookie 提示的标记、图表、指标和日历设置、“记住我”标记。它们保存在您的设备上，可通过浏览器工具清除；部分图表设置还会与账户同步（第 2 节）。",
    "termlegal.privacy.s7.p3": "没有广告和统计分析 Cookie。如果禁用 Cookie，将无法登录账户。",

    "termlegal.privacy.s8.h": "8. 保存期限和删除",
    "termlegal.privacy.s8.p1": "账户数据和您的设置在账户存在期间保存。账户删除后，与其相关的数据（设置、提醒、通知方式、设备令牌）将从数据库中删除。",
    "termlegal.privacy.s8.p2": "一次性验证码有效期 15 分钟。服务器日志仅在安全和分析错误所需的有限时间内保存。如果托管服务商或我们有备份，已删除的数据可能会保留在备份中，直到备份按计划被替换。",
    "termlegal.privacy.s8.p3":
      "应用内暂时没有自助删除账户的功能：如需删除账户，请使用账户中的电子邮件地址联系运营者（第 13 节）。我们将在适用法律规定的期限内删除数据，通常不晚于 30 天。您可以在“个人资料 → 通知设置”中关闭单项通知方式、浏览器订阅和设备令牌，并在“安全”标签页更改电子邮件和密码。",

    "termlegal.privacy.s9.h": "9. 安全",
    "termlegal.privacy.s9.p1":
      "密码以 bcrypt 哈希形式保存，与网站的连接受 HTTPS 保护，您自己机器人的令牌和 Webhook 密钥不会返回到浏览器，修改密码后此前的会话会失效。我们会限制对数据的访问，但无法保证绝对安全：请使用唯一的密码，并且不要在不属于您的设备上保持登录。",

    "termlegal.privacy.s10.h": "10. 您的权利",
    "termlegal.privacy.s10.p1": "根据您所在国家的法律，您可能有权：",
    "termlegal.privacy.s10.li1": "确认我们是否处理您的数据并获取数据副本；",
    "termlegal.privacy.s10.li2": "更正不准确的数据（姓名、电子邮件和密码可在个人资料中修改）；",
    "termlegal.privacy.s10.li3": "要求删除数据或限制处理，并反对处理；",
    "termlegal.privacy.s10.li4": "在适用时以便于转移的形式获取您的数据；",
    "termlegal.privacy.s10.li5": "随时撤回同意；这不影响撤回之前处理的合法性；",
    "termlegal.privacy.s10.li6": "向数据保护机构投诉（在俄罗斯为 Roskomnadzor，在欧盟和英国为各国监管机构）。",
    "termlegal.privacy.s10.p2":
      "我们按照俄罗斯个人数据法律（联邦法第 152-FZ 号）处理数据，并努力提供与 GDPR 和英国 GDPR 类似的权利。这并不意味着已获得正式认证或符合每一个地方的法律。如需行使权利，请联系运营者（第 13 节）；我们可能要求您确认请求来自账户所有者。",

    "termlegal.privacy.s11.h": "11. 儿童",
    "termlegal.privacy.s11.p1": "终端不面向 18 岁以下的人士，我们不会有意处理其数据。如果您认为账户由未成年人创建，请告知我们，我们会将其删除。",

    "termlegal.privacy.s12.h": "12. 政策变更",
    "termlegal.privacy.s12.p1": "我们可能更新本政策。最新版本始终在本页面，生效日期标在顶部；重大变更我们会在终端内或通过电子邮件告知。如果变更后您继续使用终端，即表示您同意这些变更。",

    "termlegal.privacy.s13.h": "13. 联系方式",
    "termlegal.privacy.s13.email": "有关数据处理的问题，以及访问、更正和删除数据的请求，请发送至运营者（自然人，品牌“Neurotrader”）的邮箱 {email}。",
    "termlegal.privacy.s13.form": "有关数据处理的问题，以及访问、更正和删除数据的请求，请通过 {url} 上的反馈表单联系运营者（自然人，品牌“Neurotrader”）。",

    // ---------- Terms ----------
    "termlegal.terms.title": "FOMO Terminal 使用条款",
    "termlegal.terms.effective": "自 2026年10月6日（06.10.2026）起生效",
    "termlegal.terms.box.title": "不构成投资建议",
    "termlegal.terms.box.li1": "FOMO Terminal 是信息工具：图表、指标、日历和提醒。其中任何内容都不是个人投资建议、买入或卖出的要约或交易信号。",
    "termlegal.terms.box.li2": "交易股票、期货、加密货币、外汇和其他金融工具存在很高的亏损风险。您可能损失全部投入，使用杠杆交易时甚至损失更多。",
    "termlegal.terms.box.li3": "过往业绩不代表未来表现。指标和分析工具不承诺盈利。",
    "termlegal.terms.box.li4": "数据可能延迟或存在错误：交易前请核对您的券商数据。决策由您自己做出，并由您自己负责。",
    "termlegal.terms.box.more": "详情见下文第 5、6 和 8 节。",

    "termlegal.terms.s1.h": "1. 接受条款",
    "termlegal.terms.s1.link": "隐私政策",
    "termlegal.terms.s1.p1":
      "本条款规范您与 FOMO Terminal（terminal.fomo.spot 网站、Android 应用、Windows 安装程序，以下简称“终端”）运营者之间的使用关系，运营者是以“Neurotrader”品牌开展活动的自然人（以下简称“运营者”）。注册或使用终端即表示您接受本条款和{privacy}。如不同意，请勿使用终端。",
    "termlegal.terms.s1.p2": "终端是拥有独立账户的独立服务。fomo.spot 网站的条款不适用于终端。",

    "termlegal.terms.s2.h": "2. 终端是什么",
    "termlegal.terms.s2.p1":
      "终端是用于查看市场的网页版以及 Android 和 Windows 应用：带指标和画线工具的图表、价格提醒和线条提醒、带提醒的经济日历、自选列表。市场数据来自莫斯科交易所、Bybit、FMP（美国期货 NYMEX、COMEX、CME、CBOT、ICE）以及外汇数据源。",
    "termlegal.terms.s2.p2": "终端不是券商、交易所或交易组织者：无法通过它进行交易或下单，我们不保管您的资金和证券，也不接收付款。使用需要注册。",
    "termlegal.terms.s2.p3": "目前终端内没有付款。运营者可以改变这一点，也可以修改其他条款，但会提前通知（第 11 节）。",

    "termlegal.terms.s3.h": "3. 账户和安全",
    "termlegal.terms.s3.li1": "年满 18 岁方可注册；每人一个账户。",
    "termlegal.terms.s3.li2": "请填写有效的电子邮件：验证码和找回密码邮件会发送到该地址。",
    "termlegal.terms.s3.li3": "请妥善保管密码：您对账户中发生的行为负责。",
    "termlegal.terms.s3.li4": "登录状态保存在终端的 Cookie 中（最长 30 天）。在不属于您的设备上请退出账户；修改密码后此前的会话会失效。",
    "termlegal.terms.s3.li5": "如果怀疑他人获得了您账户的访问权限，请修改密码并告知运营者（第 13 节）。",

    "termlegal.terms.s4.h": "4. 可接受的使用",
    "termlegal.terms.s4.p1": "禁止：",
    "termlegal.terms.s4.li1": "自动收集终端数据（解析、抓取、机器人），对网站及其 API 造成过大负载，绕过请求频率限制；",
    "termlegal.terms.s4.li2": "转售、发布或向第三方提供终端中的市场数据、行情、日历和新闻：这些数据适用交易所和数据提供商的条款，只能用于个人用途；",
    "termlegal.terms.s4.li3": "访问他人账户、其他用户的数据或服务的非公开部分；",
    "termlegal.terms.s4.li4": "干扰终端运行、上传恶意代码，或以损害服务或用户的方式查找漏洞（发现漏洞请告知运营者）；",
    "termlegal.terms.s4.li5": "创建多个账户以绕过限制（例如有效提醒的数量上限）；",
    "termlegal.terms.s4.li6": "将终端用于违反法律或他人权利的目的。",
    "termlegal.terms.s4.p2": "违反这些规则时，我们可以限制或封禁访问（第 10 节）。",

    "termlegal.terms.s5.h": "5. 数据和第三方内容",
    "termlegal.terms.s5.p1": "市场数据、新闻和经济日历数据来自第三方来源。运营者不制作也不控制这些数据，对其准确性、完整性和及时性不承担责任：",
    "termlegal.terms.s5.li1": "数据可能延迟：未接入数据源时，莫斯科交易所的公开数据约延迟 15 分钟；图表上有相应标记；",
    "termlegal.terms.s5.li2": "美国期货（NYMEX、COMEX、CME、CBOT、ICE）由第三方提供商以近月合约连续序列的形式提供；不保证实时，数值可能与您的券商报价不同；",
    "termlegal.terms.s5.li3": "数据可能有缺失、错误和不正确的值；日历事件会被推迟和修订；",
    "termlegal.terms.s5.li4": "指标数值由终端计算，可能与其他程序的计算结果不同；",
    "termlegal.terms.s5.li5": "交易所、公司的名称和商标归其所有者所有，仅用于标识品种。",
    "termlegal.terms.s5.p2": "做出决策之前，请向您的券商或交易所网站核对数据。",

    "termlegal.terms.s6.h": "6. 不构成投资建议及风险",
    "termlegal.terms.s6.p1": "运营者不是投资顾问、券商或资产管理人，不提供个人化建议，也不保证盈利。图表、指标、形态和其他分析工具仅供参考，不是交易信号。",
    "termlegal.terms.s6.p2": "金融工具交易有风险，过往业绩不代表未来表现。您自行做出交易决策，并对其承担全部责任。如有疑问，请咨询持牌的金融顾问。",
    "termlegal.terms.s6.p3": "提醒通过第三方服务（电子邮件、推送、即时通讯）发送，可能延迟或无法送达。请勿将其作为持仓的唯一保护：请在券商处设置止损单。",
    "termlegal.terms.s6.p4": "请核实您所在国家的法律是否限制您交易某些品种（例如加密货币或境外期货）：这由您自己负责。",

    "termlegal.terms.s7.h": "7. 终端的可用性",
    "termlegal.terms.s7.p1": "终端按“现状”和“可用状态”提供。我们努力保证其稳定运行，但不保证不间断运行、没有错误或随时可用：可能出现故障、技术维护和第三方服务失效。",
    "termlegal.terms.s7.p2": "运营者有权更改或终止个别功能、市场和数据源。请仅从终端网站下载 Android（APK）和 Windows 应用。",

    "termlegal.terms.s8.h": "8. 责任限制",
    "termlegal.terms.s8.p1": "在法律允许的范围内，运营者不对以下情况负责：交易决策造成的损失、预期利润损失、间接损害和数据丢失，数据中的错误、延迟和缺失，通知延迟或未送达，运行中断，以及第三方服务的行为。",
    "termlegal.terms.s8.p2": "本条款中的任何内容均不排除或限制依法不能排除或限制的责任，也不剥夺依协议不能更改的消费者权利。",

    "termlegal.terms.s9.h": "9. 知识产权",
    "termlegal.terms.s9.p1":
      "终端的程序代码、设计、文字和外观，以及“FOMO Terminal”和“Neurotrader”名称，归运营者或其许可方所有。您获得按本条款使用终端的个人的、非独占的、不可转让的权利。除法律允许的情形外，不得复制、分发终端，或利用它创建竞争性服务。",
    "termlegal.terms.s9.p2": "您的自选列表、图表布局、绘图和其他设置仍属于您；您允许我们保存和处理它们，以使终端正常运行。交易所和提供商的数据归其所有。",

    "termlegal.terms.s10.h": "10. 终止和封禁",
    "termlegal.terms.s10.p1": "您可以随时停止使用终端。如需删除账户，请联系运营者（第 13 节）；流程见《隐私政策》。",
    "termlegal.terms.s10.p2": "运营者可因违反条款、安全威胁或法律要求而暂停或封禁账户，也可停止终端的运营。如有可能，我们会提前通知。账户关闭后，数据将按《隐私政策》删除。",

    "termlegal.terms.s11.h": "11. 条款变更",
    "termlegal.terms.s11.p1":
      "运营者可以更改本条款，包括对部分功能引入收费。新版本发布在本页面，生效日期标在顶部；重大变更我们会提前在终端内或通过电子邮件告知。如果变更生效后您继续使用终端，即表示接受新版本；如不同意，请停止使用。",

    "termlegal.terms.s12.h": "12. 适用法律",
    "termlegal.terms.s12.p1": "本条款适用俄罗斯联邦法律，但您居住国家保护消费者的强制性规定另有要求的除外：这类规定仍然归您享有，本条款不能限制它们。我们会尽量通过协商解决争议；协商不成的，按适用法律规定的方式处理。",

    "termlegal.terms.s13.h": "13. 联系方式",
    "termlegal.terms.s13.email": "有关本条款的问题、投诉和请求，请发送至运营者（自然人，品牌“Neurotrader”）的邮箱 {email}。",
    "termlegal.terms.s13.form": "有关本条款的问题、投诉和请求，请通过 {url} 上的反馈表单联系运营者（自然人，品牌“Neurotrader”）。",
  },
};

export default dict;
