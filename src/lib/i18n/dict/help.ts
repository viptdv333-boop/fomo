import type { SectionDict } from "./types";

// Some values carry a leading/trailing space on purpose: they sit next to an
// inline <b> or <Link> and reproduce the exact spacing of the original JSX.
// Chinese values drop those spaces.
const dict: SectionDict = {
  ru: {
    "help.title": "Как пользоваться FOMO",
    "help.subtitle":
      "Всё, что нужно знать: от регистрации до продажи прогнозов. Читается за десять минут, дальше можно возвращаться к нужному разделу.",
    "help.toc": "Содержание",

    "help.nav.start": "С чего начать",
    "help.nav.registration": "Регистрация",
    "help.nav.cabinet": "Личный кабинет",
    "help.nav.ideas": "Публикация идей",
    "help.nav.rating": "Рейтинг автора",
    "help.nav.paidIdeas": "Платные идеи",
    "help.nav.channels": "Каналы",
    "help.nav.payments": "Приём оплаты",
    "help.nav.commission": "Комиссии",
    "help.nav.terminal": "Инструменты и терминал",
    "help.nav.rules": "Правила",
    "help.nav.faq": "Частые вопросы",

    // Start
    "help.start.title": "С чего начать",
    "help.start.p1":
      "FOMO — площадка, где трейдеры публикуют торговые идеи по конкретным инструментам, обсуждают их и продают доступ к своей аналитике. Читатель находит авторов с проверяемой историей прогнозов, автор получает аудиторию и возможность заработать на том, что и так пишет.",
    "help.start.p2": "Три вещи, которые стоит понять сразу:",
    "help.start.li1b": "Публиковать может каждый.",
    "help.start.li1": " Бесплатные идеи доступны с первого дня без всяких порогов.",
    "help.start.li2b": "Деньги идут напрямую автору.",
    "help.start.li2": " Площадка не берёт комиссию и не держит ваши средства.",
    "help.start.li3b": "Рейтинг — это репутация.",
    "help.start.li3": " Он считается автоматически и открывает платные возможности.",
    "help.start.note":
      "Публикации на FOMO — частные мнения, а не инвестиционные рекомендации. Решение о сделке всегда остаётся за вами.",

    // Registration
    "help.reg.title": "Регистрация",
    "help.reg.p1": "Занимает минуту, одобрение администратора не требуется.",
    "help.reg.s1t": "Введите почту",
    "help.reg.s1d": "На странице регистрации укажите адрес и подтвердите, что вы не робот.",
    "help.reg.s2t": "Заберите код из письма",
    "help.reg.s2d":
      "Придёт шестизначный код с адреса no-reply@fomo.spot. Он действует 15 минут. Если письма нет — проверьте «Спам».",
    "help.reg.s3t": "Придумайте имя и пароль",
    "help.reg.s3d":
      "Пароль — от 8 символов. Слишком простые и часто встречающиеся пароли система не примет.",
    "help.reg.warn":
      "Повторно запросить код можно раз в минуту, а пять неверных попыток ввода гасят код — придётся запросить новый. Это защита от подбора, а не придирка.",
    "help.reg.pwa":
      "Сайт можно поставить как приложение: откройте его в браузере телефона и выберите «Добавить на главный экран».",

    // Cabinet
    "help.cab.title": "Личный кабинет",
    "help.cab.p1a": "Всё управление собрано в ",
    "help.cab.p1link": "профиле",
    "help.cab.p1c": ", на четырёх вкладках.",
    "help.cab.c1t": "Профиль",
    "help.cab.c1d":
      "Имя, аватар, описание, специализация, город, опыт на бирже. Это то, что видят читатели.",
    "help.cab.c2t": "Финансы",
    "help.cab.c2d":
      "Способы оплаты, ваши каналы, подписки, покупки и продажи, расходы. Главная вкладка для автора.",
    "help.cab.c3t": "Мои идеи",
    "help.cab.c3d": "Список ваших публикаций. Здесь же удаление — по одной или все сразу.",
    "help.cab.c4t": "Безопасность",
    "help.cab.c4d": "Смена пароля и почты. Смена пароля завершает все остальные сессии.",

    // Ideas
    "help.ideas.title": "Публикация идей",
    "help.ideas.p1a": "Кнопка «Создать идею» доступна прямо на доске, когда вы вошли в аккаунт.",
    "help.ideas.p1b": " Ограничений по рейтингу для бесплатных идей нет",
    "help.ideas.p1c": " — публикуйте с первого дня.",
    "help.ideas.s1t": "Заголовок",
    "help.ideas.s1d": "Коротко и по делу: инструмент и суть движения.",
    "help.ideas.s2t": "Превью",
    "help.ideas.s2d":
      "Свободный текст, который видят все. У платной идеи это витрина — по нему решают, покупать ли.",
    "help.ideas.s3t": "Полный контент",
    "help.ideas.s3d": "Аргументация, уровни входа и выхода, скриншоты графиков.",
    "help.ideas.s4t": "Инструменты",
    "help.ideas.s4d":
      "Отметьте бумаги, о которых речь. По этим тегам идею находят в ленте и на страницах инструментов.",
    "help.ideas.note":
      "Теги — не украшение. Читатели фильтруют ленту по своим инструментам, и идея без правильных тегов до них просто не дойдёт. Отмечайте только то, о чём действительно пишете.",
    "help.ideas.p2":
      "Ограничение одно: не больше 10 публикаций в час. Оно защищает ленту от флуда и в обычной работе не мешает.",

    // Rating
    "help.rating.title": "Рейтинг автора",
    "help.rating.p1":
      "Рейтинг считается автоматически и показывается звёздами. Он определяет, что вам доступно, и помогает читателям выбирать, кого читать.",
    "help.rating.f1": "рейтинг = 3.0 — стартовое значение",
    "help.rating.f2": "+ 0.05 × опубликованных идей (максимум +2.0)",
    "help.rating.f3": "+ 0.30 × подписчиков",
    "help.rating.f4": "+ 0.10 × лайков",
    "help.rating.f5": "− 0.15 × дизлайков",
    "help.rating.f6": "− 0.05 × дней простоя сверх недели",
    "help.rating.f7": "итог ограничен диапазоном 1.0 — 10.0",
    "help.rating.p2a": "Пересчёт происходит при публикации, оценке, подписке и отписке. ",
    "help.rating.p2b": "Публикация никогда не понижает рейтинг",
    "help.rating.p2c": " — только повышает.",
    "help.rating.warn":
      "Штраф за простой: первая неделя после последней публикации бесплатна, дальше рейтинг снижается на 0.05 в день. Опубликуйте новую идею — отсчёт начнётся заново. Логика в том, что рейтинг показывает не только качество, но и то, что автор в рынке сейчас.",

    // Paid ideas
    "help.paid.title": "Платные идеи",
    "help.paid.p1":
      "У платной идеи открыты заголовок и превью, а полный текст и вложения появляются после оплаты.",
    "help.paid.p2": "Сколько платных идей можно публиковать — зависит от рейтинга:",
    "help.paid.th1": "Рейтинг",
    "help.paid.th2": "Платных идей в неделю",
    "help.paid.r1": "ниже 3.0",
    "help.paid.v1": "нельзя",
    "help.paid.r2": "3.0 — 5.0",
    "help.paid.v2": "до 3",
    "help.paid.r3": "5.0 — 7.0",
    "help.paid.v3": "до 10",
    "help.paid.r4": "от 7.0",
    "help.paid.v4": "без ограничений",
    "help.paid.window":
      "Лимит считается по последним семи дням — это скользящее окно, а не календарная неделя.",
    "help.paid.note":
      "На бесплатной идее можно включить приём донатов: читатель заплатит, только если сам захочет поблагодарить.",

    // Channels
    "help.ch.title": "Каналы: бесплатный и платный",
    "help.ch.p1b": "Бесплатный канал",
    "help.ch.p1":
      " у вас уже есть — это ваш профиль. Любой читатель нажимает «Подписаться» и получает уведомления о ваших новых идеях. Ничего настраивать не нужно, порога по рейтингу нет.",
    "help.ch.p2b": "Платный канал",
    "help.ch.p2":
      " — это подписка: читатель платит за период и получает доступ ко всем вашим платным материалам, пока она активна. У канала есть свой закрытый чат для подписчиков.",
    "help.ch.howTitle": "Как создать платный канал",
    "help.ch.s1t": "Наберите рейтинг 5.0",
    "help.ch.s1d": "Ниже этого порога раздел недоступен. Публикуйте идеи и набирайте подписчиков.",
    "help.ch.s2t": "Добавьте способ оплаты",
    "help.ch.s2d": "Профиль → Финансы → Способы оплаты. Без него тариф не сохранить.",
    "help.ch.s3t": "Создайте канал",
    "help.ch.s3d": "Аватарка, название, описание и хэштеги — инструменты, по которым вы работаете.",
    "help.ch.s4t": "Настройте тарифы",
    "help.ch.s4d":
      "Название, цена в рублях, срок в днях и способ оплаты. Тарифов может быть несколько — например месяц и год.",
    "help.ch.warn":
      "Подписка не продлевается автоматически. Она заканчивается в назначенный день, и доступ закрывается — читатель оформляет заново, если захочет продолжить.",

    // Payments
    "help.pay.title": "Приём оплаты",
    "help.pay.p1a":
      "Реквизиты хранятся в профиле и подставляются в тарифы. Добавить их можно в разделе ",
    "help.pay.p1b": "Финансы → Способы оплаты",
    "help.pay.p1c": ".",
    "help.pay.card1t": "Банковская карта",
    "help.pay.card1d":
      "Номер карты и понятное вам название вроде «Тинькофф *2977». Покупатель переводит вам напрямую, вы подтверждаете поступление.",
    "help.pay.card2t": "ЮKassa",
    "help.pay.card2d":
      "Идентификатор магазина и секретный ключ из личного кабинета ЮKassa. Подходит, если у вас оформлено ИП или самозанятость.",
    "help.pay.flowTitle": "Как проходит оплата",
    "help.pay.p2":
      "Покупатель нажимает «Купить» — создаётся заявка. Он переводит сумму по вашим реквизитам и прикладывает подтверждение платежа. Вам приходит уведомление, вы сверяете поступление и подтверждаете. Доступ открывается сразу, а для подписки одновременно открывается закрытый чат канала.",
    "help.pay.p3a": "Если денег не увидели — заявку можно отклонить. Все заявки видны в разделе ",
    "help.pay.p3b": "Финансы → Мои продажи",
    "help.pay.p3c": ".",
    "help.pay.warn":
      "Подтверждайте оплату быстро — покупатель ждёт доступ и видит только ваше молчание. Это самый частый повод для недовольства на площадках с прямыми расчётами.",

    // Commission
    "help.fee.title": "Комиссии",
    "help.fee.big": "FOMO не берёт комиссию с продаж идей и подписок",
    "help.fee.p1":
      "Расчёты идут напрямую между читателем и автором, площадка в них не участвует и денег не удерживает. Сколько указали в тарифе — столько и получили.",
    "help.fee.p2":
      "Регистрация, чтение бесплатных идей, чаты и торговый терминал тоже бесплатны. Платить нужно только автору и только за платный материал.",
    "help.fee.warn":
      "У прямых расчётов есть обратная сторона: при конфликте площадка не может вернуть деньги, потому что никогда их не получала. Поэтому перед покупкой смотрите на рейтинг автора и его прошлые публикации — это лучшая защита.",

    // Terminal
    "help.term.title": "Инструменты, терминал и чаты",
    "help.term.p1":
      "В каталоге больше 380 инструментов: все акции основного режима Московской биржи, топ-30 криптовалют, крупнейшие акции США, фьючерсы на нефть, газ, металлы и зерновые, индексы и валютные пары.",
    "help.term.p2link": "Терминал",
    "help.term.p2":
      " показывает графики и котировки: российские бумаги и фьючерсы с Московской биржи, криптовалюты с Bybit, американские акции от внешнего провайдера.",
    "help.term.warn":
      "Котировки носят справочный характер и могут отставать от биржи. Торговые решения принимайте по данным своего брокера.",
    "help.term.p3a": "У каждого актива есть свой ",
    "help.term.p3link": "чат",
    "help.term.p3c":
      " — нефть, золото, Сбербанк и так далее. Плюс личные сообщения и закрытые чаты платных каналов.",

    // Rules
    "help.rules.title": "Правила",
    "help.rules.goodTitle": "Приветствуется",
    "help.rules.good1": "Идея с обоснованием: почему так, где вход, где признаёте себя неправым",
    "help.rules.good2":
      "Честный разбор своих ошибок — доверия это добавляет больше, чем серия удачных прогнозов",
    "help.rules.good3": "Точные теги инструментов",
    "help.rules.badTitle": "Запрещено",
    "help.rules.bad1": "Гарантии доходности в любом виде",
    "help.rules.bad2": "Чужой материал под своим именем",
    "help.rules.bad3":
      "Накрутка рейтинга: взаимные лайки по сговору, пустые идеи ради бонуса, фальшивые аккаунты",
    "help.rules.bad4":
      "Сбор средств «в управление», финансовые пирамиды, реклама сторонних сервисов",
    "help.rules.bad5": "Чужие персональные данные, оскорбления, травля",
    "help.rules.bad6": "Требование предоплаты мимо механики заявок",
    "help.rules.p1":
      "Нарушение — материал скрывается модерацией, аккаунт ограничивается или блокируется. Рейтинг, полученный накруткой, обнуляется.",

    // FAQ
    "help.faq.title": "Частые вопросы",
    "help.faq.q1": "Сколько стоит пользоваться FOMO?",
    "help.faq.a1":
      "Регистрация, чтение бесплатных идей, чаты и терминал — бесплатно. Платите только автору за его платный материал.",
    "help.faq.q2": "Нужно ли одобрение администратора при регистрации?",
    "help.faq.a2": "Нет. Аккаунт активен сразу после подтверждения почты.",
    "help.faq.q3": "Можно ли удалить свою идею?",
    "help.faq.a3":
      "Да, в разделе «Мои идеи»: крестик на каждой публикации и кнопка удаления всех сразу.",
    "help.faq.q4": "Почему рейтинг падает, если я ничего не делаю?",
    "help.faq.a4":
      "Это штраф за простой: через неделю после последней публикации рейтинг снижается на 0.05 в день. Новая идея обнуляет отсчёт.",
    "help.faq.q5": "Что делать, если автор не подтверждает оплату?",
    "help.faq.a5":
      "Напишите ему в личные сообщения — чаще всего это просто задержка. Если ответа нет, обратитесь в поддержку: мы примем меры к автору, но вернуть деньги площадка не может, так как их не получала.",
    "help.faq.q6": "Можно ли поменять почту или пароль?",
    "help.faq.a6":
      "Да, во вкладке «Безопасность». Смена пароля завершает все остальные сессии — если аккаунтом кто-то пользовался, он потеряет доступ.",
    "help.faq.q7": "Приходят ли ответы на письма от FOMO?",
    "help.faq.a7":
      "Нет, адрес no-reply@fomo.spot не принимает почту. По вопросам пишите в поддержку через профиль.",

    // CTA
    "help.cta.title": "Готовы опубликовать первую идею?",
    "help.cta.sub": "Регистрация занимает минуту, публиковать можно сразу",
    "help.cta.register": "Зарегистрироваться",
    "help.cta.feed": "Смотреть идеи",

    // Illustrations (SVG labels)
    "help.ill.reg.title": "Три шага регистрации: почта, код из письма, имя и пароль",
    "help.ill.reg.s1t": "Почта",
    "help.ill.reg.s1d": "Вводите адрес",
    "help.ill.reg.s2t": "Код",
    "help.ill.reg.s2d": "6 цифр из письма",
    "help.ill.reg.s3t": "Профиль",
    "help.ill.reg.s3d": "Имя и пароль",
    "help.ill.reg.caption": "Аккаунт активен сразу — модерация не нужна",

    "help.ill.cab.title": "Личный кабинет: вкладки Профиль, Финансы, Мои идеи, Безопасность",
    "help.ill.cab.tab1": "Профиль",
    "help.ill.cab.tab2": "Финансы",
    "help.ill.cab.tab3": "Мои идеи",
    "help.ill.cab.tab4": "Безопасность",
    "help.ill.cab.row1": "Способы оплаты",
    "help.ill.cab.row2": "Мои каналы",
    "help.ill.cab.row3": "Мои подписки",
    "help.ill.cab.row4": "Мои покупки и продажи",
    "help.ill.cab.caption": "Вкладка «Финансы» — всё о деньгах в одном месте",

    "help.ill.rating.title": "Шкала рейтинга: пороги 3, 5 и 7 баллов открывают платные возможности",
    "help.ill.rating.none": "платных идей нет",
    "help.ill.rating.w3": "3 в неделю",
    "help.ill.rating.w10": "10 в неделю",
    "help.ill.rating.unlimited": "без лимита",
    "help.ill.rating.channel": "от 5.0 — можно создать платный канал",
    "help.ill.rating.start": "Стартовый рейтинг нового автора — 3.0",

    "help.ill.pay.title": "Как проходит оплата: заявка, перевод, чек, подтверждение автором, доступ",
    "help.ill.pay.s1t": "Покупатель",
    "help.ill.pay.s1d": "нажимает «Купить»",
    "help.ill.pay.s2t": "Перевод",
    "help.ill.pay.s2d": "по реквизитам автора",
    "help.ill.pay.s3t": "Чек",
    "help.ill.pay.s3d": "прикладывает к заявке",
    "help.ill.pay.s4t": "Автор",
    "help.ill.pay.s4d": "подтверждает",
    "help.ill.pay.s5t": "Доступ",
    "help.ill.pay.s5d": "открывается",
    "help.ill.pay.caption": "Деньги идут напрямую от читателя к автору — площадка их не держит",
    "help.ill.pay.fee": "Комиссия FOMO — 0%",

    "help.ill.ch.title": "Карточка канала с двумя тарифами: месяц и год",
    "help.ill.ch.logo": "лого",
    "help.ill.ch.name": "Нефть и газ каждый день",
    "help.ill.ch.desc": "Разбор Brent и Henry Hub перед открытием",
    "help.ill.ch.tag1": "#нефть",
    "help.ill.ch.tag2": "#газ",
    "help.ill.ch.month": "Месяц",
    "help.ill.ch.year": "Год",
    "help.ill.ch.d30": "30 дней",
    "help.ill.ch.d365": "365 дней",

    "help.ill.fvp.title":
      "Разница между бесплатной и платной идеей: у платной виден только заголовок и превью",
    "help.ill.fvp.free": "Бесплатная",
    "help.ill.fvp.paid": "Платная",
    "help.ill.fvp.hidden": "текст скрыт",
    "help.ill.fvp.afterPay": "откроется после оплаты",
    "help.ill.fvp.buy": "Купить",
    "help.ill.fvp.everyone": "читают все, включая гостей",
  },

  en: {
    "help.title": "How to use FOMO",
    "help.subtitle":
      "Everything you need to know, from signing up to selling your forecasts. It takes ten minutes to read, and you can come back to any section later.",
    "help.toc": "Contents",

    "help.nav.start": "Getting started",
    "help.nav.registration": "Sign-up",
    "help.nav.cabinet": "Your account",
    "help.nav.ideas": "Publishing ideas",
    "help.nav.rating": "Author rating",
    "help.nav.paidIdeas": "Paid ideas",
    "help.nav.channels": "Channels",
    "help.nav.payments": "Accepting payments",
    "help.nav.commission": "Fees",
    "help.nav.terminal": "Instruments and terminal",
    "help.nav.rules": "Rules",
    "help.nav.faq": "FAQ",

    "help.start.title": "Getting started",
    "help.start.p1":
      "FOMO is a platform where traders publish trading ideas on specific instruments, discuss them and sell access to their analysis. Readers find authors with a verifiable forecast history; authors get an audience and a way to earn from what they already write.",
    "help.start.p2": "Three things worth understanding right away:",
    "help.start.li1b": "Anyone can publish.",
    "help.start.li1": " Free ideas are available from day one, with no thresholds.",
    "help.start.li2b": "Money goes straight to the author.",
    "help.start.li2": " The platform takes no commission and never holds your funds.",
    "help.start.li3b": "Rating is your reputation.",
    "help.start.li3": " It is calculated automatically and unlocks paid features.",
    "help.start.note":
      "Posts on FOMO are personal opinions, not investment advice. The decision to trade is always yours.",

    "help.reg.title": "Sign-up",
    "help.reg.p1": "It takes a minute; no administrator approval is needed.",
    "help.reg.s1t": "Enter your email",
    "help.reg.s1d": "On the sign-up page, enter your address and confirm you are not a robot.",
    "help.reg.s2t": "Get the code from the email",
    "help.reg.s2d":
      "You will receive a six-digit code from no-reply@fomo.spot. It is valid for 15 minutes. If there is no email, check your Spam folder.",
    "help.reg.s3t": "Choose a name and password",
    "help.reg.s3d":
      "The password must be at least 8 characters. The system will reject passwords that are too simple or too common.",
    "help.reg.warn":
      "You can request a new code once a minute, and five wrong attempts invalidate the code — you will have to request a new one. This protects against brute-forcing; it is not nitpicking.",
    "help.reg.pwa":
      "You can install the site as an app: open it in your phone's browser and choose “Add to Home Screen”.",

    "help.cab.title": "Your account",
    "help.cab.p1a": "Everything is managed in your ",
    "help.cab.p1link": "profile",
    "help.cab.p1c": ", across four tabs.",
    "help.cab.c1t": "Profile",
    "help.cab.c1d":
      "Name, avatar, bio, specialization, city, market experience. This is what readers see.",
    "help.cab.c2t": "Finance",
    "help.cab.c2d":
      "Payment methods, your channels, subscriptions, purchases and sales, expenses. The main tab for authors.",
    "help.cab.c3t": "My ideas",
    "help.cab.c3d": "A list of your posts. You can delete them here too — one at a time or all at once.",
    "help.cab.c4t": "Security",
    "help.cab.c4d": "Change your password and email. Changing the password ends all other sessions.",

    "help.ideas.title": "Publishing ideas",
    "help.ideas.p1a": "The “Create idea” button is right on the board once you are signed in.",
    "help.ideas.p1b": " There are no rating requirements for free ideas",
    "help.ideas.p1c": " — publish from day one.",
    "help.ideas.s1t": "Title",
    "help.ideas.s1d": "Short and to the point: the instrument and the gist of the move.",
    "help.ideas.s2t": "Preview",
    "help.ideas.s2d":
      "Free text that everyone sees. For a paid idea it is the shop window — readers decide whether to buy based on it.",
    "help.ideas.s3t": "Full content",
    "help.ideas.s3d": "Your reasoning, entry and exit levels, chart screenshots.",
    "help.ideas.s4t": "Instruments",
    "help.ideas.s4d":
      "Tag the securities you are writing about. These tags are how the idea is found in the feed and on instrument pages.",
    "help.ideas.note":
      "Tags are not decoration. Readers filter the feed by their instruments, and an idea without the right tags simply won't reach them. Only tag what you are actually writing about.",
    "help.ideas.p2":
      "There is just one limit: no more than 10 posts per hour. It protects the feed from flooding and doesn't get in the way of normal use.",

    "help.rating.title": "Author rating",
    "help.rating.p1":
      "The rating is calculated automatically and shown as stars. It determines what is available to you and helps readers choose whom to follow.",
    "help.rating.f1": "rating = 3.0 — starting value",
    "help.rating.f2": "+ 0.05 × ideas published (max +2.0)",
    "help.rating.f3": "+ 0.30 × followers",
    "help.rating.f4": "+ 0.10 × likes",
    "help.rating.f5": "− 0.15 × dislikes",
    "help.rating.f6": "− 0.05 × idle days beyond one week",
    "help.rating.f7": "the result is capped to the range 1.0 — 10.0",
    "help.rating.p2a": "It is recalculated on every post, rating, follow and unfollow. ",
    "help.rating.p2b": "Publishing never lowers your rating",
    "help.rating.p2c": " — it only raises it.",
    "help.rating.warn":
      "Inactivity penalty: the first week after your last post is free; after that the rating drops by 0.05 per day. Publish a new idea and the countdown starts over. The logic is that the rating shows not only quality but also that the author is active in the market right now.",

    "help.paid.title": "Paid ideas",
    "help.paid.p1":
      "A paid idea shows its title and preview openly; the full text and attachments appear after payment.",
    "help.paid.p2": "How many paid ideas you can publish depends on your rating:",
    "help.paid.th1": "Rating",
    "help.paid.th2": "Paid ideas per week",
    "help.paid.r1": "below 3.0",
    "help.paid.v1": "not allowed",
    "help.paid.r2": "3.0 — 5.0",
    "help.paid.v2": "up to 3",
    "help.paid.r3": "5.0 — 7.0",
    "help.paid.v3": "up to 10",
    "help.paid.r4": "7.0 and above",
    "help.paid.v4": "unlimited",
    "help.paid.window":
      "The limit counts the last seven days — it is a rolling window, not a calendar week.",
    "help.paid.note":
      "On a free idea you can enable donations: a reader pays only if they want to say thank you.",

    "help.ch.title": "Channels: free and paid",
    "help.ch.p1b": "A free channel",
    "help.ch.p1":
      " is something you already have — it is your profile. Any reader clicks “Follow” and gets notified about your new ideas. Nothing to set up, and no rating threshold.",
    "help.ch.p2b": "A paid channel",
    "help.ch.p2":
      " is a subscription: the reader pays for a period and gets access to all your paid content while it is active. The channel has its own private chat for subscribers.",
    "help.ch.howTitle": "How to create a paid channel",
    "help.ch.s1t": "Reach a rating of 5.0",
    "help.ch.s1d": "Below this threshold the section is unavailable. Publish ideas and gain followers.",
    "help.ch.s2t": "Add a payment method",
    "help.ch.s2d": "Profile → Finance → Payment methods. You can't save a plan without one.",
    "help.ch.s3t": "Create the channel",
    "help.ch.s3d": "Avatar, name, description and hashtags — the instruments you trade.",
    "help.ch.s4t": "Set up plans",
    "help.ch.s4d":
      "Name, price in rubles, duration in days and payment method. You can have several plans — for example, monthly and yearly.",
    "help.ch.warn":
      "Subscriptions do not renew automatically. A subscription ends on its set date and access is closed — the reader subscribes again if they want to continue.",

    "help.pay.title": "Accepting payments",
    "help.pay.p1a":
      "Your payment details are stored in your profile and attached to your plans. You can add them under ",
    "help.pay.p1b": "Finance → Payment methods",
    "help.pay.p1c": ".",
    "help.pay.card1t": "Bank card",
    "help.pay.card1d":
      "The card number and a label that makes sense to you, like “Tinkoff *2977”. The buyer transfers money to you directly and you confirm receipt.",
    "help.pay.card2t": "YooKassa",
    "help.pay.card2d":
      "The shop ID and secret key from your YooKassa account. Suitable if you are registered as a sole proprietor or self-employed.",
    "help.pay.flowTitle": "How payment works",
    "help.pay.p2":
      "The buyer clicks “Buy” and a payment request is created. They transfer the amount to your details and attach proof of payment. You get a notification, check that the money arrived and confirm. Access opens immediately, and for a subscription the channel's private chat opens at the same time.",
    "help.pay.p3a":
      "If you don't see the money, you can reject the request. All requests are listed under ",
    "help.pay.p3b": "Finance → My sales",
    "help.pay.p3c": ".",
    "help.pay.warn":
      "Confirm payments quickly — the buyer is waiting for access and sees nothing but your silence. This is the most common source of complaints on platforms with direct payments.",

    "help.fee.title": "Fees",
    "help.fee.big": "FOMO charges no commission on sales of ideas or subscriptions",
    "help.fee.p1":
      "Payments go directly between the reader and the author; the platform is not involved and holds no money. Whatever price you set in the plan is what you receive.",
    "help.fee.p2":
      "Sign-up, reading free ideas, chats and the trading terminal are free too. You only pay the author, and only for paid content.",
    "help.fee.warn":
      "Direct payments have a downside: in a dispute the platform cannot refund money, because it never received it. So before buying, look at the author's rating and past posts — that is the best protection.",

    "help.term.title": "Instruments, terminal and chats",
    "help.term.p1":
      "The catalog has more than 380 instruments: all main-board shares of the Moscow Exchange, the top 30 cryptocurrencies, the largest US stocks, futures on oil, gas, metals and grains, indices and currency pairs.",
    "help.term.p2link": "The terminal",
    "help.term.p2":
      " shows charts and quotes: Russian securities and futures from the Moscow Exchange, cryptocurrencies from Bybit, and US stocks from an external provider.",
    "help.term.warn":
      "Quotes are for reference only and may lag behind the exchange. Base your trading decisions on your broker's data.",
    "help.term.p3a": "Every asset has its own ",
    "help.term.p3link": "chat",
    "help.term.p3c":
      " — oil, gold, Sberbank and so on. Plus direct messages and private chats of paid channels.",

    "help.rules.title": "Rules",
    "help.rules.goodTitle": "Encouraged",
    "help.rules.good1": "Ideas with reasoning: why, where to enter, where you admit you were wrong",
    "help.rules.good2":
      "Honest review of your own mistakes — it builds more trust than a streak of winning calls",
    "help.rules.good3": "Accurate instrument tags",
    "help.rules.badTitle": "Prohibited",
    "help.rules.bad1": "Guarantees of returns in any form",
    "help.rules.bad2": "Someone else's content under your name",
    "help.rules.bad3":
      "Rating manipulation: collusive mutual likes, empty ideas for the bonus, fake accounts",
    "help.rules.bad4":
      "Raising money “for management”, pyramid schemes, advertising third-party services",
    "help.rules.bad5": "Other people's personal data, insults, harassment",
    "help.rules.bad6": "Demanding prepayment outside the request mechanism",
    "help.rules.p1":
      "Violations: the content is hidden by moderators and the account is restricted or banned. Rating gained through manipulation is reset to zero.",

    "help.faq.title": "FAQ",
    "help.faq.q1": "How much does FOMO cost?",
    "help.faq.a1":
      "Sign-up, reading free ideas, chats and the terminal are free. You only pay authors for their paid content.",
    "help.faq.q2": "Does sign-up require administrator approval?",
    "help.faq.a2": "No. Your account is active as soon as you confirm your email.",
    "help.faq.q3": "Can I delete my idea?",
    "help.faq.a3":
      "Yes, in the “My ideas” section: there is a cross on each post and a button to delete them all at once.",
    "help.faq.q4": "Why does my rating drop when I do nothing?",
    "help.faq.a4":
      "It is the inactivity penalty: a week after your last post, the rating drops by 0.05 per day. A new idea resets the countdown.",
    "help.faq.q5": "What if an author doesn't confirm my payment?",
    "help.faq.a5":
      "Send them a direct message — most often it is just a delay. If there is no reply, contact support: we will take action against the author, but the platform cannot refund the money because it never received it.",
    "help.faq.q6": "Can I change my email or password?",
    "help.faq.a6":
      "Yes, in the “Security” tab. Changing the password ends all other sessions — if anyone else was using your account, they will lose access.",
    "help.faq.q7": "Can I reply to emails from FOMO?",
    "help.faq.a7":
      "No, the no-reply@fomo.spot address does not accept mail. For questions, contact support through your profile.",

    "help.cta.title": "Ready to publish your first idea?",
    "help.cta.sub": "Sign-up takes a minute, and you can publish right away",
    "help.cta.register": "Sign up",
    "help.cta.feed": "Browse ideas",

    "help.ill.reg.title": "Three sign-up steps: email, code from the email, name and password",
    "help.ill.reg.s1t": "Email",
    "help.ill.reg.s1d": "Enter your address",
    "help.ill.reg.s2t": "Code",
    "help.ill.reg.s2d": "6 digits from email",
    "help.ill.reg.s3t": "Profile",
    "help.ill.reg.s3d": "Name and password",
    "help.ill.reg.caption": "The account is active immediately — no moderation needed",

    "help.ill.cab.title": "Your account: Profile, Finance, My ideas and Security tabs",
    "help.ill.cab.tab1": "Profile",
    "help.ill.cab.tab2": "Finance",
    "help.ill.cab.tab3": "My ideas",
    "help.ill.cab.tab4": "Security",
    "help.ill.cab.row1": "Payment methods",
    "help.ill.cab.row2": "My channels",
    "help.ill.cab.row3": "My subscriptions",
    "help.ill.cab.row4": "My purchases and sales",
    "help.ill.cab.caption": "The “Finance” tab — everything about money in one place",

    "help.ill.rating.title": "Rating scale: thresholds of 3, 5 and 7 points unlock paid features",
    "help.ill.rating.none": "no paid ideas",
    "help.ill.rating.w3": "3 per week",
    "help.ill.rating.w10": "10 per week",
    "help.ill.rating.unlimited": "no limit",
    "help.ill.rating.channel": "from 5.0 — you can create a paid channel",
    "help.ill.rating.start": "A new author's starting rating is 3.0",

    "help.ill.pay.title":
      "How payment works: request, transfer, receipt, author confirmation, access",
    "help.ill.pay.s1t": "Buyer",
    "help.ill.pay.s1d": "clicks “Buy”",
    "help.ill.pay.s2t": "Transfer",
    "help.ill.pay.s2d": "to author's details",
    "help.ill.pay.s3t": "Receipt",
    "help.ill.pay.s3d": "attached to request",
    "help.ill.pay.s4t": "Author",
    "help.ill.pay.s4d": "confirms",
    "help.ill.pay.s5t": "Access",
    "help.ill.pay.s5d": "is granted",
    "help.ill.pay.caption":
      "Money goes directly from reader to author — the platform never holds it",
    "help.ill.pay.fee": "FOMO fee — 0%",

    "help.ill.ch.title": "A channel card with two plans: monthly and yearly",
    "help.ill.ch.logo": "logo",
    "help.ill.ch.name": "Oil & Gas Daily",
    "help.ill.ch.desc": "Brent and Henry Hub breakdown before the open",
    "help.ill.ch.tag1": "#oil",
    "help.ill.ch.tag2": "#gas",
    "help.ill.ch.month": "Month",
    "help.ill.ch.year": "Year",
    "help.ill.ch.d30": "30 days",
    "help.ill.ch.d365": "365 days",

    "help.ill.fvp.title":
      "Free vs paid idea: a paid idea shows only its title and preview",
    "help.ill.fvp.free": "Free",
    "help.ill.fvp.paid": "Paid",
    "help.ill.fvp.hidden": "text hidden",
    "help.ill.fvp.afterPay": "unlocks after payment",
    "help.ill.fvp.buy": "Buy",
    "help.ill.fvp.everyone": "everyone can read, including guests",
  },

  cn: {
    "help.title": "如何使用 FOMO",
    "help.subtitle":
      "从注册到出售预测，您需要了解的一切都在这里。十分钟即可读完，之后可随时回到所需章节查阅。",
    "help.toc": "目录",

    "help.nav.start": "入门",
    "help.nav.registration": "注册",
    "help.nav.cabinet": "个人中心",
    "help.nav.ideas": "发布观点",
    "help.nav.rating": "作者评分",
    "help.nav.paidIdeas": "付费观点",
    "help.nav.channels": "频道",
    "help.nav.payments": "收款",
    "help.nav.commission": "佣金",
    "help.nav.terminal": "交易品种与终端",
    "help.nav.rules": "规则",
    "help.nav.faq": "常见问题",

    "help.start.title": "入门",
    "help.start.p1":
      "FOMO 是一个交易者平台：交易者针对具体品种发布交易观点、展开讨论，并出售其分析内容的访问权限。读者可以找到预测记录可查证的作者，作者则获得受众，并能从本来就在写的内容中获得收入。",
    "help.start.p2": "有三点需要首先了解：",
    "help.start.li1b": "人人都可以发布。",
    "help.start.li1": "免费观点从第一天起即可发布，没有任何门槛。",
    "help.start.li2b": "资金直接支付给作者。",
    "help.start.li2": "平台不收取佣金，也不代管您的资金。",
    "help.start.li3b": "评分即信誉。",
    "help.start.li3": "评分自动计算，并解锁付费功能。",
    "help.start.note": "FOMO 上的内容均为个人观点，而非投资建议。是否交易始终由您自己决定。",

    "help.reg.title": "注册",
    "help.reg.p1": "只需一分钟，无需管理员审核。",
    "help.reg.s1t": "输入邮箱",
    "help.reg.s1d": "在注册页面填写邮箱地址，并确认您不是机器人。",
    "help.reg.s2t": "获取邮件中的验证码",
    "help.reg.s2d":
      "您将收到来自 no-reply@fomo.spot 的六位验证码，有效期 15 分钟。如果没有收到邮件，请检查“垃圾邮件”文件夹。",
    "help.reg.s3t": "设置用户名和密码",
    "help.reg.s3d": "密码至少 8 位。过于简单或常见的密码系统将不予接受。",
    "help.reg.warn":
      "每分钟只能重新获取一次验证码，输错五次后验证码将失效，需要重新获取。这是为了防止暴力破解，并非刁难。",
    "help.reg.pwa": "您可以将网站安装为应用：在手机浏览器中打开网站，选择“添加到主屏幕”。",

    "help.cab.title": "个人中心",
    "help.cab.p1a": "所有管理功能都集中在",
    "help.cab.p1link": "个人资料",
    "help.cab.p1c": "中，共四个标签页。",
    "help.cab.c1t": "个人资料",
    "help.cab.c1d": "用户名、头像、简介、专长、城市、交易经验。这些是读者能看到的信息。",
    "help.cab.c2t": "财务",
    "help.cab.c2d": "支付方式、您的频道、订阅、购买与销售记录、支出。作者最常用的标签页。",
    "help.cab.c3t": "我的观点",
    "help.cab.c3d": "您发布的内容列表，也可在此删除——逐条删除或一次性全部删除。",
    "help.cab.c4t": "安全",
    "help.cab.c4d": "修改密码和邮箱。修改密码后，其他所有会话都将被注销。",

    "help.ideas.title": "发布观点",
    "help.ideas.p1a": "登录后，看板上即可看到“创建观点”按钮。",
    "help.ideas.p1b": "免费观点不受评分限制",
    "help.ideas.p1c": "——从第一天起即可发布。",
    "help.ideas.s1t": "标题",
    "help.ideas.s1d": "简明扼要：交易品种及行情要点。",
    "help.ideas.s2t": "预览",
    "help.ideas.s2d": "所有人都能看到的自由文本。对付费观点而言，它就是橱窗——读者据此决定是否购买。",
    "help.ideas.s3t": "完整内容",
    "help.ideas.s3d": "论证过程、入场和出场点位、图表截图。",
    "help.ideas.s4t": "交易品种",
    "help.ideas.s4d": "标记所讨论的证券。读者正是通过这些标签在信息流和品种页面中找到您的观点。",
    "help.ideas.note":
      "标签不是装饰。读者会按自己关注的品种筛选信息流，没有正确标签的观点根本无法触达他们。请只标记您真正在讨论的品种。",
    "help.ideas.p2": "唯一的限制：每小时最多发布 10 条。这是为了防止刷屏，正常使用不受影响。",

    "help.rating.title": "作者评分",
    "help.rating.p1": "评分自动计算，以星级显示。它决定您可以使用哪些功能，也帮助读者选择关注谁。",
    "help.rating.f1": "评分 = 3.0 —— 初始值",
    "help.rating.f2": "+ 0.05 × 已发布观点数（最多 +2.0）",
    "help.rating.f3": "+ 0.30 × 订阅者数",
    "help.rating.f4": "+ 0.10 × 点赞数",
    "help.rating.f5": "− 0.15 × 点踩数",
    "help.rating.f6": "− 0.05 × 超过一周的闲置天数",
    "help.rating.f7": "结果限定在 1.0 — 10.0 范围内",
    "help.rating.p2a": "发布、评价、订阅和取消订阅时会重新计算评分。",
    "help.rating.p2b": "发布内容永远不会降低评分",
    "help.rating.p2c": "——只会提高。",
    "help.rating.warn":
      "闲置扣分：最后一次发布后的第一周不扣分，之后评分每天下降 0.05。发布新观点后重新开始计时。其逻辑在于，评分不仅反映质量，也反映作者当前是否仍活跃在市场中。",

    "help.paid.title": "付费观点",
    "help.paid.p1": "付费观点的标题和预览公开可见，完整正文和附件在付款后显示。",
    "help.paid.p2": "可发布的付费观点数量取决于评分：",
    "help.paid.th1": "评分",
    "help.paid.th2": "每周付费观点数",
    "help.paid.r1": "低于 3.0",
    "help.paid.v1": "不可发布",
    "help.paid.r2": "3.0 — 5.0",
    "help.paid.v2": "最多 3 条",
    "help.paid.r3": "5.0 — 7.0",
    "help.paid.v3": "最多 10 条",
    "help.paid.r4": "7.0 及以上",
    "help.paid.v4": "不限",
    "help.paid.window": "限额按最近七天计算——这是滚动窗口，而非自然周。",
    "help.paid.note": "免费观点可以开启打赏：只有读者自己愿意致谢时才会付款。",

    "help.ch.title": "频道：免费与付费",
    "help.ch.p1b": "免费频道",
    "help.ch.p1":
      "您已经拥有——就是您的个人资料。任何读者点击“订阅”即可收到您新观点的通知。无需任何设置，也没有评分门槛。",
    "help.ch.p2b": "付费频道",
    "help.ch.p2":
      "即订阅：读者按周期付费，在订阅有效期内可访问您的全部付费内容。频道还设有订阅者专属的私密聊天。",
    "help.ch.howTitle": "如何创建付费频道",
    "help.ch.s1t": "评分达到 5.0",
    "help.ch.s1d": "低于该门槛时此功能不可用。请发布观点、积累订阅者。",
    "help.ch.s2t": "添加支付方式",
    "help.ch.s2d": "个人资料 → 财务 → 支付方式。没有支付方式则无法保存套餐。",
    "help.ch.s3t": "创建频道",
    "help.ch.s3d": "头像、名称、简介和话题标签——即您交易的品种。",
    "help.ch.s4t": "设置套餐",
    "help.ch.s4d": "名称、价格（卢布）、期限（天）和支付方式。可以设置多个套餐——例如月度和年度。",
    "help.ch.warn":
      "订阅不会自动续期。订阅在指定日期到期，访问随即关闭——读者如想继续，需要重新订阅。",

    "help.pay.title": "收款",
    "help.pay.p1a": "收款信息保存在个人资料中，并自动填入套餐。可在以下位置添加：",
    "help.pay.p1b": "财务 → 支付方式",
    "help.pay.p1c": "。",
    "help.pay.card1t": "银行卡",
    "help.pay.card1d":
      "卡号以及便于您识别的名称，例如“Tinkoff *2977”。买家直接向您转账，由您确认到账。",
    "help.pay.card2t": "YooKassa",
    "help.pay.card2d":
      "YooKassa 商户后台中的商店 ID 和密钥。适用于已登记为个体经营者或自雇人士的用户。",
    "help.pay.flowTitle": "付款流程",
    "help.pay.p2":
      "买家点击“购买”后会生成一条付款申请。买家按您的收款信息转账，并附上付款凭证。您会收到通知，核对到账后进行确认。访问权限随即开放；如为订阅，频道私密聊天也会同时开放。",
    "help.pay.p3a": "如果没有收到款项，可以拒绝该申请。所有申请均可在以下位置查看：",
    "help.pay.p3b": "财务 → 我的销售",
    "help.pay.p3c": "。",
    "help.pay.warn":
      "请尽快确认付款——买家在等待访问权限，而他们只能看到您的沉默。在直接结算的平台上，这是最常见的不满来源。",

    "help.fee.title": "佣金",
    "help.fee.big": "FOMO 不对观点和订阅的销售收取佣金",
    "help.fee.p1":
      "款项在读者与作者之间直接结算，平台不参与，也不扣留任何资金。套餐标价多少，您就收到多少。",
    "help.fee.p2": "注册、阅读免费观点、聊天和交易终端同样免费。只需向作者付费，且仅限付费内容。",
    "help.fee.warn":
      "直接结算也有不利之处：发生纠纷时，平台无法退款，因为它从未收到过这笔钱。因此购买前请查看作者的评分和以往发布的内容——这是最好的保护。",

    "help.term.title": "交易品种、终端与聊天",
    "help.term.p1":
      "目录中有超过 380 个交易品种：莫斯科交易所主板全部股票、前 30 大加密货币、美国最大的股票、石油、天然气、金属和谷物期货，以及指数和货币对。",
    "help.term.p2link": "终端",
    "help.term.p2":
      "显示图表和行情：来自莫斯科交易所的俄罗斯证券和期货、来自 Bybit 的加密货币，以及由外部数据商提供的美国股票。",
    "help.term.warn": "行情仅供参考，可能滞后于交易所。请依据您券商的数据做出交易决策。",
    "help.term.p3a": "每个资产都有自己的",
    "help.term.p3link": "聊天",
    "help.term.p3c": "——石油、黄金、俄罗斯联邦储蓄银行等。此外还有私信和付费频道的私密聊天。",

    "help.rules.title": "规则",
    "help.rules.goodTitle": "鼓励",
    "help.rules.good1": "有论证的观点：为什么这样判断、在哪里入场、在哪里承认自己判断错误",
    "help.rules.good2": "坦诚复盘自己的失误——这比一连串成功的预测更能赢得信任",
    "help.rules.good3": "准确的品种标签",
    "help.rules.badTitle": "禁止",
    "help.rules.bad1": "任何形式的收益保证",
    "help.rules.bad2": "将他人的内容冒充为自己的",
    "help.rules.bad3": "刷评分：串通互相点赞、为获取加分发布空洞观点、虚假账号",
    "help.rules.bad4": "募集资金“代为管理”、金融传销、为第三方服务做广告",
    "help.rules.bad5": "他人的个人数据、侮辱、网络欺凌",
    "help.rules.bad6": "绕过申请机制要求预付款",
    "help.rules.p1": "违规时，内容将被审核隐藏，账号将被限制或封禁。通过刷分获得的评分将被清零。",

    "help.faq.title": "常见问题",
    "help.faq.q1": "使用 FOMO 需要付费吗？",
    "help.faq.a1": "注册、阅读免费观点、聊天和终端均免费。您只需为作者的付费内容向作者付款。",
    "help.faq.q2": "注册需要管理员审核吗？",
    "help.faq.a2": "不需要。确认邮箱后账号即刻生效。",
    "help.faq.q3": "可以删除自己的观点吗？",
    "help.faq.a3": "可以，在“我的观点”中：每条内容都有删除按钮（叉号），也可以一键全部删除。",
    "help.faq.q4": "为什么我什么都没做，评分却在下降？",
    "help.faq.a4": "这是闲置扣分：最后一次发布一周后，评分每天下降 0.05。发布新观点即可重新计时。",
    "help.faq.q5": "如果作者不确认我的付款怎么办？",
    "help.faq.a5":
      "请先给作者发私信——大多数情况只是延迟。如果没有回复，请联系客服：我们会对作者采取措施，但平台无法退款，因为从未收到过这笔钱。",
    "help.faq.q6": "可以修改邮箱或密码吗？",
    "help.faq.a6":
      "可以，在“安全”标签页中。修改密码后其他所有会话都将被注销——如果有人在使用您的账号，他将失去访问权限。",
    "help.faq.q7": "可以回复 FOMO 发来的邮件吗？",
    "help.faq.a7": "不可以，no-reply@fomo.spot 地址不接收邮件。如有问题，请通过个人资料联系客服。",

    "help.cta.title": "准备好发布您的第一个观点了吗？",
    "help.cta.sub": "注册只需一分钟，注册后即可发布",
    "help.cta.register": "注册",
    "help.cta.feed": "浏览观点",

    "help.ill.reg.title": "注册三步：邮箱、邮件验证码、用户名和密码",
    "help.ill.reg.s1t": "邮箱",
    "help.ill.reg.s1d": "输入邮箱地址",
    "help.ill.reg.s2t": "验证码",
    "help.ill.reg.s2d": "邮件中的 6 位数字",
    "help.ill.reg.s3t": "个人资料",
    "help.ill.reg.s3d": "用户名和密码",
    "help.ill.reg.caption": "账号即刻生效——无需审核",

    "help.ill.cab.title": "个人中心：个人资料、财务、我的观点、安全四个标签页",
    "help.ill.cab.tab1": "个人资料",
    "help.ill.cab.tab2": "财务",
    "help.ill.cab.tab3": "我的观点",
    "help.ill.cab.tab4": "安全",
    "help.ill.cab.row1": "支付方式",
    "help.ill.cab.row2": "我的频道",
    "help.ill.cab.row3": "我的订阅",
    "help.ill.cab.row4": "我的购买与销售",
    "help.ill.cab.caption": "“财务”标签页——与资金有关的一切尽在一处",

    "help.ill.rating.title": "评分刻度：3、5、7 分门槛解锁付费功能",
    "help.ill.rating.none": "不可发布付费观点",
    "help.ill.rating.w3": "每周 3 条",
    "help.ill.rating.w10": "每周 10 条",
    "help.ill.rating.unlimited": "不限",
    "help.ill.rating.channel": "5.0 起——可创建付费频道",
    "help.ill.rating.start": "新作者初始评分为 3.0",

    "help.ill.pay.title": "付款流程：申请、转账、凭证、作者确认、开放访问",
    "help.ill.pay.s1t": "买家",
    "help.ill.pay.s1d": "点击“购买”",
    "help.ill.pay.s2t": "转账",
    "help.ill.pay.s2d": "按作者收款信息",
    "help.ill.pay.s3t": "凭证",
    "help.ill.pay.s3d": "附在申请中",
    "help.ill.pay.s4t": "作者",
    "help.ill.pay.s4d": "确认",
    "help.ill.pay.s5t": "访问",
    "help.ill.pay.s5d": "随即开放",
    "help.ill.pay.caption": "资金由读者直接支付给作者——平台不代管资金",
    "help.ill.pay.fee": "FOMO 佣金 — 0%",

    "help.ill.ch.title": "含两个套餐（月度和年度）的频道卡片",
    "help.ill.ch.logo": "标志",
    "help.ill.ch.name": "每日石油与天然气",
    "help.ill.ch.desc": "开盘前解读 Brent 与 Henry Hub",
    "help.ill.ch.tag1": "#石油",
    "help.ill.ch.tag2": "#天然气",
    "help.ill.ch.month": "月度",
    "help.ill.ch.year": "年度",
    "help.ill.ch.d30": "30 天",
    "help.ill.ch.d365": "365 天",

    "help.ill.fvp.title": "免费观点与付费观点的区别：付费观点仅显示标题和预览",
    "help.ill.fvp.free": "免费",
    "help.ill.fvp.paid": "付费",
    "help.ill.fvp.hidden": "正文已隐藏",
    "help.ill.fvp.afterPay": "付款后解锁",
    "help.ill.fvp.buy": "购买",
    "help.ill.fvp.everyone": "所有人可读，包括访客",
  },
};

export default dict;
