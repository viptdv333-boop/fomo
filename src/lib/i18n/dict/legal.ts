import type { SectionDict } from "./types";

// Terms of service and privacy policy. The Russian text is the legally binding
// version; en/cn are convenience translations (see *.translationNote).
// Values with a leading/trailing space sit next to an inline <b> or <Link>.
const dict: SectionDict = {
  ru: {
    // ---------- Terms ----------
    "terms.translationNote": "",
    "terms.title": "Пользовательское соглашение",
    "terms.effective": "Действует с 1 августа 2026 года",
    "terms.box.title": "Главное, что нужно понять перед регистрацией",
    "terms.box.subj": "Платформа ",
    "terms.box.li1b": "не несёт ответственности",
    "terms.box.li1c":
      " за содержание публикаций и за результат сделок, совершённых на их основе, — идеи здесь частное мнение авторов, а не инвестиционная рекомендация.",
    "terms.box.li2b": "ничего не продаёт",
    "terms.box.li2c":
      ": платные идеи и подписки оплачиваются напрямую от одного пользователя другому, минуя Платформу. Она не сторона в этих расчётах и не хранит деньги.",
    "terms.box.li3b": "никого ни к чему не обязывает",
    "terms.box.li3c":
      " — публикация, покупка и подписка на канал целиком добровольны, и от их условий Платформа не может освободить или принудить ни одну из сторон.",
    "terms.box.li4b":
      "не является инвестиционным советником, брокером или организатором торговли",
    "terms.box.li4c": " и не даёт торговых рекомендаций.",
    "terms.box.more": "Подробности — в разделах 4, 5 и 9 ниже.",

    "terms.s1.h": "1. Предмет соглашения",
    "terms.s1.p1a":
      "Настоящее соглашение регулирует отношения между администратором платформы FOMO (далее — «Платформа») и любым лицом, использующим Платформу (далее — «Пользователь»). Регистрируясь на Платформе, вы подтверждаете, что прочитали и принимаете условия настоящего соглашения и ",
    "terms.s1.link": "Политики обработки персональных данных",
    "terms.s1.p1c": ".",

    "terms.s2.h": "2. Что такое FOMO",
    "terms.s2.p1":
      "FOMO — платформа для публикации и обсуждения торговых идей по финансовым инструментам: акциям, фьючерсам, криптовалюте и валютным парам. Пользователи могут публиковать идеи бесплатно или платно, вести платные каналы и обсуждать инструменты в чатах.",

    "terms.s3.h": "3. Регистрация и аккаунт",
    "terms.s3.li1": "Регистрация доступна дееспособным лицам старше 18 лет;",
    "terms.s3.li2": "один человек вправе иметь один аккаунт; создание дублирующих аккаунтов запрещено;",
    "terms.s3.li3":
      "вы несёте ответственность за сохранность пароля и за все действия под вашим аккаунтом;",
    "terms.s3.li4": "Платформа вправе заблокировать аккаунт при нарушении настоящего соглашения.",

    "terms.s4.h": "4. Содержание публикаций — важно понимать",
    "terms.s4.p1b":
      "Публикации на Платформе являются частным мнением их авторов и не являются индивидуальной инвестиционной рекомендацией",
    "terms.s4.p1c":
      " в значении Федерального закона от 22.04.1996 № 39-ФЗ «О рынке ценных бумаг». Платформа не является инвестиционным советником, брокером или организатором торговли.",
    "terms.s4.p2":
      "Решение о совершении сделок вы принимаете самостоятельно и на свой риск. Ни авторы идей, ни администрация Платформы не несут ответственности за финансовые результаты, полученные на основании опубликованных материалов.",

    "terms.s5.h": "5. Платные материалы и расчёты между пользователями",
    "terms.s5.li1":
      "оплата идей и подписок на каналы производится напрямую от Пользователя-покупателя Пользователю-автору, по реквизитам, указанным автором;",
    "terms.s5.li2":
      "Платформа не является стороной этих расчётов, не удерживает и не хранит денежные средства и не взимает комиссию с продаж;",
    "terms.s5.li3": "подтверждение оплаты и открытие доступа к материалу производит автор самостоятельно;",
    "terms.s5.li4":
      "споры по оплате разрешаются между покупателем и автором напрямую; Платформа может содействовать в рассмотрении обращения, но не гарантирует возврат средств, поскольку никогда их не получает;",
    "terms.s5.li5":
      "подписка на платный канал действует до истечения оплаченного периода и не продлевается автоматически.",

    "terms.s6.h": "6. Рейтинг и ограничения на платные публикации",
    "terms.s6.p1":
      "Рейтинг автора рассчитывается автоматически на основе активности и обратной связи пользователей. От рейтинга зависит возможность публикации платных идей и создания платных каналов. Правила расчёта могут изменяться Платформой без предварительного уведомления, применяются к будущим действиям и не понижают уже опубликованные результаты.",

    "terms.s7.h": "7. Правила поведения и общения",
    "terms.s7.p1":
      "Регистрируясь, Пользователь обязуется соблюдать вежливость и уважительный тон в идеях, комментариях и чатах Платформы — независимо от того, согласен он с чужой торговой идеей или нет.",
    "terms.s7.forbidden": "На Платформе запрещены:",
    "terms.s7.li1b": "нецензурная лексика",
    "terms.s7.li1c":
      " и её замаскированные варианты (звёздочки, транслит, пробелы внутри слова и т. п.);",
    "terms.s7.li2b": "оскорбления, унижения и переход на личности",
    "terms.s7.li2c": " — в том числе адресованные автору идеи, с которым Пользователь не согласен;",
    "terms.s7.li3b": "травля, домогательства и угрозы",
    "terms.s7.li3c": " в адрес других пользователей;",
    "terms.s7.li4":
      "разжигание вражды по признаку национальности, религии, пола, возраста или иного статуса;",
    "terms.s7.li5b": "политические и религиозные дискуссии, не связанные с анализом рынка",
    "terms.s7.li5c":
      " — агитация, споры о политических взглядах, оценки партий и деятелей. Разбор того, как конкретное политическое или макроэкономическое событие (санкции, решение ЦБ, выборы и т. п.) повлияло или может повлиять на инструмент, — это обычный рабочий контент Платформы и данный пункт его не касается;",
    "terms.s7.li6": "призывы к насилию, экстремизму или противоправным действиям;",
    "terms.s7.li7":
      "спам и флуд: повторяющиеся сообщения, бессмысленные комментарии, накрутка активности в чатах;",
    "terms.s7.li8":
      "обсуждение и продажа тем, не относящихся к финансовым рынкам (в том числе через личные сообщения);",
    "terms.s7.li9":
      "публикация шок-контента, материалов 18+ и любого контента, запрещённого законодательством РФ.",
    "terms.s7.p2":
      "Модерация вправе скрыть нарушающее правила сообщение или идею без предварительного предупреждения. Систематические нарушения влекут временное ограничение аккаунта, при повторных случаях — блокировку без возврата уже потраченных на Платформе средств.",

    "terms.s8.h": "8. Запрещённые действия",
    "terms.s8.li1": "гарантировать доходность или обещать конкретный финансовый результат;",
    "terms.s8.li2": "публиковать чужие материалы под своим именем;",
    "terms.s8.li3":
      "накручивать рейтинг: создавать фиктивные аккаунты, вступать в сговор о взаимных оценках, публиковать идеи без содержательной ценности;",
    "terms.s8.li4":
      "собирать средства «в доверительное управление», предлагать участие в финансовых пирамидах;",
    "terms.s8.li5": "размещать рекламу сторонних сервисов без согласования;",
    "terms.s8.li6": "публиковать персональные данные третьих лиц, оскорбления, угрозы;",
    "terms.s8.li7": "требовать предоплату в обход механики заявок на оплату Платформы;",
    "terms.s8.li8":
      "использовать автоматизированные средства для массовой регистрации аккаунтов или обхода технических ограничений.",
    "terms.s8.p1":
      "Нарушение влечёт скрытие материала, ограничение или блокировку аккаунта. Рейтинг, полученный в результате накрутки, аннулируется.",

    "terms.s9.h": "9. Интеллектуальная собственность",
    "terms.s9.p1":
      "Публикуя материал на Платформе, вы сохраняете авторские права на него и предоставляете Платформе неисключительную лицензию на его отображение в рамках сервиса. Использование чужих текстов и изображений без разрешения правообладателя запрещено.",

    "terms.s10.h": "10. Ограничение ответственности",
    "terms.s10.p1":
      "Платформа предоставляется «как есть». Она выполняет исключительно роль витрины и технической площадки: показывает публикации, соединяет пользователей друг с другом и передаёт уведомления. Платформа не продаёт, не покупает, не хранит и не гарантирует ничего из того, чем обмениваются пользователи между собой, и не обязывает ни одну из сторон исполнять договорённости, достигнутые через неё.",
    "terms.s10.p2":
      "Администрация не гарантирует бесперебойную работу Сайта, точность котировок в торговом терминале (они носят справочный характер и могут отставать от биржевых данных) и не несёт ответственности за действия других пользователей, включая неисполнение обязательств по оплате, недостоверность указанной ими информации или качество опубликованных идей.",

    "terms.s11.h": "11. Изменение соглашения",
    "terms.s11.p1":
      "Администрация вправе изменять условия соглашения. Продолжение использования Платформы после публикации изменений означает согласие с новой редакцией.",

    "terms.s12.h": "12. Контакты",
    "terms.s12.p1":
      "По вопросам, связанным с настоящим соглашением, обращайтесь через поддержку в личном кабинете.",

    // ---------- Privacy ----------
    "privacy.translationNote": "",
    "privacy.title": "Политика обработки персональных данных",
    "privacy.effective": "Действует с 1 августа 2026 года",

    "privacy.s1.h": "1. Общие положения",
    "privacy.s1.p1":
      "Настоящая Политика определяет порядок обработки персональных данных пользователей сайта fomo.spot (далее — «Сайт», «FOMO») в соответствии с Федеральным законом от 27.07.2006 № 152-ФЗ «О персональных данных».",
    "privacy.s1.p2":
      "Оператором обработки персональных данных является физическое лицо — администратор Сайта (далее — «Оператор»). Используя Сайт, вы соглашаетесь с условиями настоящей Политики.",

    "privacy.s2.h": "2. Какие данные мы собираем",
    "privacy.s2.p1": "При регистрации и использовании Сайта Оператор может обрабатывать:",
    "privacy.s2.li1": "адрес электронной почты — для регистрации, входа и связи с вами;",
    "privacy.s2.li2": "имя, аватар, описание профиля и специализацию — если вы их указали;",
    "privacy.s2.li3": "город, место работы, опыт на бирже, дату рождения — если вы их указали;",
    "privacy.s2.li4":
      "реквизиты для приёма оплаты (номер карты, данные ЮKassa) — если вы настраиваете платный канал или идеи. Эти данные вы вводите сами, и они видны только вам и используются только для отображения в ваших тарифах;",
    "privacy.s2.li5":
      "техническую информацию: IP-адрес, файлы cookie, данные об устройстве и браузере, историю действий на Сайте.",
    "privacy.s2.p2":
      "Сайт не запрашивает и не хранит данные банковских карт покупателей — оплата идей и подписок происходит напрямую между пользователями, вне платёжной инфраструктуры Сайта.",

    "privacy.s3.h": "3. Цели обработки",
    "privacy.s3.li1": "регистрация и авторизация на Сайте;",
    "privacy.s3.li2": "отображение вашего профиля и публикаций другим пользователям;",
    "privacy.s3.li3":
      "отправка кодов подтверждения, уведомлений о заявках на оплату и других технических писем;",
    "privacy.s3.li4": "защита от мошенничества, спама и массовой автоматической регистрации;",
    "privacy.s3.li5": "улучшение работы Сайта на основе аналитики посещаемости;",
    "privacy.s3.li6": "рассмотрение обращений в поддержку.",

    "privacy.s4.h": "4. Cookie и аналитика",
    "privacy.s4.p1":
      "Сайт использует файлы cookie и аналогичные технологии для работы входа в аккаунт, запоминания темы оформления и языка, а также для статистики посещаемости через Яндекс.Метрику и Google Analytics. Эти сервисы могут устанавливать собственные cookie в соответствии со своими политиками конфиденциальности.",
    "privacy.s4.p2":
      "Вы можете отключить cookie в настройках браузера, но это может ограничить работу Сайта, включая вход в аккаунт.",

    "privacy.s5.h": "5. Передача данных третьим лицам",
    "privacy.s5.p1":
      "Оператор не продаёт и не передаёт персональные данные третьим лицам, за исключением:",
    "privacy.s5.li1":
      "сервисов, обеспечивающих техническую работу Сайта (хостинг, отправка почты, аналитика);",
    "privacy.s5.li2": "случаев, предусмотренных законодательством Российской Федерации.",
    "privacy.s5.p2":
      "Данные профиля, которые вы сами делаете публичными (имя, аватар, идеи, комментарии), видны другим пользователям и посетителям Сайта — это не является передачей третьим лицам в смысле настоящей Политики.",

    "privacy.s6.h": "6. Хранение и защита данных",
    "privacy.s6.p1":
      "Пароли хранятся в необратимо хешированном виде и никогда не обрабатываются в открытом тексте. Данные хранятся на серверах, доступ к которым ограничен. Срок хранения — до удаления аккаунта или до истечения необходимости в обработке.",

    "privacy.s7.h": "7. Ваши права",
    "privacy.s7.p1": "Вы вправе в любой момент:",
    "privacy.s7.li1": "изменить или удалить данные своего профиля в личном кабинете;",
    "privacy.s7.li2": "сменить или удалить платёжные реквизиты в разделе «Финансы»;",
    "privacy.s7.li3":
      "запросить полное удаление аккаунта и связанных с ним персональных данных, обратившись в поддержку;",
    "privacy.s7.li4":
      "отозвать согласие на обработку данных, что повлечёт невозможность дальнейшего использования Сайта.",

    "privacy.s8.h": "8. Изменение Политики",
    "privacy.s8.p1":
      "Оператор вправе вносить изменения в настоящую Политику. Актуальная редакция всегда доступна на этой странице.",

    "privacy.s9.h": "9. Контакты",
    "privacy.s9.p1":
      "По вопросам обработки персональных данных обращайтесь через раздел поддержки в вашем личном кабинете.",
  },

  en: {
    // ---------- Terms ----------
    "terms.translationNote":
      "This is a translation for convenience; the Russian version is legally binding.",
    "terms.title": "User Agreement",
    "terms.effective": "Effective from August 1, 2026",
    "terms.box.title": "The key points to understand before signing up",
    "terms.box.subj": "The Platform ",
    "terms.box.li1b": "bears no responsibility",
    "terms.box.li1c":
      " for the content of posts or for the outcome of trades made on their basis — ideas here are the personal opinions of their authors, not investment advice.",
    "terms.box.li2b": "sells nothing",
    "terms.box.li2c":
      ": paid ideas and subscriptions are paid for directly from one user to another, bypassing the Platform. It is not a party to these payments and does not hold any money.",
    "terms.box.li3b": "does not obligate anyone to anything",
    "terms.box.li3c":
      " — publishing, purchasing and subscribing to a channel are entirely voluntary, and the Platform can neither release any party from their terms nor compel any party to comply with them.",
    "terms.box.li4b":
      "is not an investment adviser, broker or trade organizer",
    "terms.box.li4c": " and does not give trading recommendations.",
    "terms.box.more": "Details are in sections 4, 5 and 9 below.",

    "terms.s1.h": "1. Subject of the Agreement",
    "terms.s1.p1a":
      "This Agreement governs the relationship between the administrator of the FOMO platform (hereinafter, the “Platform”) and any person using the Platform (hereinafter, the “User”). By registering on the Platform, you confirm that you have read and accept the terms of this Agreement and of the ",
    "terms.s1.link": "Personal Data Processing Policy",
    "terms.s1.p1c": ".",

    "terms.s2.h": "2. What FOMO Is",
    "terms.s2.p1":
      "FOMO is a platform for publishing and discussing trading ideas on financial instruments: stocks, futures, cryptocurrency and currency pairs. Users can publish ideas for free or for a fee, run paid channels and discuss instruments in chats.",

    "terms.s3.h": "3. Registration and Account",
    "terms.s3.li1": "Registration is available to persons with full legal capacity over 18 years of age;",
    "terms.s3.li2":
      "one person may have one account; creating duplicate accounts is prohibited;",
    "terms.s3.li3":
      "you are responsible for keeping your password secure and for all actions taken under your account;",
    "terms.s3.li4": "the Platform may block an account if this Agreement is violated.",

    "terms.s4.h": "4. Content of Posts — Important to Understand",
    "terms.s4.p1b":
      "Posts on the Platform are the personal opinions of their authors and are not individual investment advice",
    "terms.s4.p1c":
      " within the meaning of Federal Law No. 39-FZ of 22.04.1996 “On the Securities Market”. The Platform is not an investment adviser, broker or trade organizer.",
    "terms.s4.p2":
      "You make decisions to enter into trades independently and at your own risk. Neither the authors of ideas nor the Platform administration bear responsibility for financial results obtained on the basis of published materials.",

    "terms.s5.h": "5. Paid Materials and Payments Between Users",
    "terms.s5.li1":
      "payment for ideas and channel subscriptions is made directly by the buying User to the authoring User, using the payment details specified by the author;",
    "terms.s5.li2":
      "the Platform is not a party to these payments, does not withhold or hold funds, and does not charge a commission on sales;",
    "terms.s5.li3":
      "the author independently confirms payment and opens access to the material;",
    "terms.s5.li4":
      "payment disputes are resolved directly between the buyer and the author; the Platform may assist in reviewing a complaint but does not guarantee a refund, since it never receives the funds;",
    "terms.s5.li5":
      "a subscription to a paid channel is valid until the end of the paid period and is not renewed automatically.",

    "terms.s6.h": "6. Rating and Restrictions on Paid Posts",
    "terms.s6.p1":
      "An author's rating is calculated automatically based on activity and user feedback. The ability to publish paid ideas and create paid channels depends on the rating. The calculation rules may be changed by the Platform without prior notice; changes apply to future actions and do not lower results already published.",

    "terms.s7.h": "7. Rules of Conduct and Communication",
    "terms.s7.p1":
      "By registering, the User undertakes to maintain politeness and a respectful tone in ideas, comments and chats on the Platform — regardless of whether they agree with someone else's trading idea.",
    "terms.s7.forbidden": "The following are prohibited on the Platform:",
    "terms.s7.li1b": "obscene language",
    "terms.s7.li1c":
      " and its disguised variants (asterisks, transliteration, spaces inside words, etc.);",
    "terms.s7.li2b": "insults, humiliation and personal attacks",
    "terms.s7.li2c":
      " — including those directed at the author of an idea with whom the User disagrees;",
    "terms.s7.li3b": "bullying, harassment and threats",
    "terms.s7.li3c": " against other users;",
    "terms.s7.li4":
      "inciting hatred on the grounds of nationality, religion, gender, age or any other status;",
    "terms.s7.li5b": "political and religious discussions unrelated to market analysis",
    "terms.s7.li5c":
      " — campaigning, arguments about political views, assessments of parties and public figures. Analysis of how a specific political or macroeconomic event (sanctions, a Central Bank decision, elections, etc.) has affected or may affect an instrument is ordinary working content of the Platform, and this clause does not apply to it;",
    "terms.s7.li6": "calls for violence, extremism or unlawful actions;",
    "terms.s7.li7":
      "spam and flooding: repetitive messages, meaningless comments, artificially inflating activity in chats;",
    "terms.s7.li8":
      "discussing and selling topics unrelated to financial markets (including via direct messages);",
    "terms.s7.li9":
      "publishing shock content, 18+ materials and any content prohibited by the laws of the Russian Federation.",
    "terms.s7.p2":
      "Moderators may hide a message or idea that violates the rules without prior warning. Systematic violations result in temporary restriction of the account and, in repeated cases, blocking without refund of funds already spent on the Platform.",

    "terms.s8.h": "8. Prohibited Actions",
    "terms.s8.li1": "guaranteeing returns or promising a specific financial result;",
    "terms.s8.li2": "publishing other people's materials under your own name;",
    "terms.s8.li3":
      "artificially inflating the rating: creating fake accounts, colluding on mutual ratings, publishing ideas with no substantive value;",
    "terms.s8.li4":
      "raising funds “for trust management”, offering participation in financial pyramid schemes;",
    "terms.s8.li5": "placing advertising for third-party services without approval;",
    "terms.s8.li6": "publishing personal data of third parties, insults, threats;",
    "terms.s8.li7":
      "demanding prepayment in circumvention of the Platform's payment request mechanism;",
    "terms.s8.li8":
      "using automated means for mass account registration or for circumventing technical restrictions.",
    "terms.s8.p1":
      "A violation results in hiding of the material, restriction or blocking of the account. Rating obtained through artificial inflation is cancelled.",

    "terms.s9.h": "9. Intellectual Property",
    "terms.s9.p1":
      "By publishing material on the Platform, you retain the copyright to it and grant the Platform a non-exclusive license to display it within the service. Using other people's texts and images without the permission of the rights holder is prohibited.",

    "terms.s10.h": "10. Limitation of Liability",
    "terms.s10.p1":
      "The Platform is provided “as is”. It acts solely as a showcase and a technical venue: it displays posts, connects users with each other and delivers notifications. The Platform does not sell, buy, hold or guarantee anything that users exchange among themselves, and does not obligate any party to perform agreements reached through it.",
    "terms.s10.p2":
      "The administration does not guarantee uninterrupted operation of the Site or the accuracy of quotes in the trading terminal (they are for reference only and may lag behind exchange data), and bears no responsibility for the actions of other users, including failure to fulfil payment obligations, inaccuracy of the information they provide or the quality of published ideas.",

    "terms.s11.h": "11. Changes to the Agreement",
    "terms.s11.p1":
      "The administration may change the terms of the Agreement. Continued use of the Platform after changes are published constitutes acceptance of the new version.",

    "terms.s12.h": "12. Contacts",
    "terms.s12.p1":
      "For questions related to this Agreement, please contact support in your personal account.",

    // ---------- Privacy ----------
    "privacy.translationNote":
      "This is a translation for convenience; the Russian version is legally binding.",
    "privacy.title": "Personal Data Processing Policy",
    "privacy.effective": "Effective from August 1, 2026",

    "privacy.s1.h": "1. General Provisions",
    "privacy.s1.p1":
      "This Policy sets out the procedure for processing the personal data of users of the fomo.spot website (hereinafter, the “Site”, “FOMO”) in accordance with Federal Law No. 152-FZ of 27.07.2006 “On Personal Data”.",
    "privacy.s1.p2":
      "The operator of personal data processing is an individual — the administrator of the Site (hereinafter, the “Operator”). By using the Site, you agree to the terms of this Policy.",

    "privacy.s2.h": "2. What Data We Collect",
    "privacy.s2.p1": "When you register and use the Site, the Operator may process:",
    "privacy.s2.li1": "your email address — for registration, sign-in and communicating with you;",
    "privacy.s2.li2": "name, avatar, profile description and specialization — if you have provided them;",
    "privacy.s2.li3":
      "city, place of work, market experience, date of birth — if you have provided them;",
    "privacy.s2.li4":
      "payment details for receiving payments (card number, YooKassa data) — if you set up a paid channel or ideas. You enter this data yourself; it is visible only to you and is used only for display in your plans;",
    "privacy.s2.li5":
      "technical information: IP address, cookies, device and browser data, history of actions on the Site.",
    "privacy.s2.p2":
      "The Site does not request or store buyers' bank card data — payment for ideas and subscriptions takes place directly between users, outside the Site's payment infrastructure.",

    "privacy.s3.h": "3. Purposes of Processing",
    "privacy.s3.li1": "registration and authorization on the Site;",
    "privacy.s3.li2": "displaying your profile and posts to other users;",
    "privacy.s3.li3":
      "sending confirmation codes, notifications about payment requests and other technical emails;",
    "privacy.s3.li4": "protection against fraud, spam and mass automated registration;",
    "privacy.s3.li5": "improving the Site based on traffic analytics;",
    "privacy.s3.li6": "handling support requests.",

    "privacy.s4.h": "4. Cookies and Analytics",
    "privacy.s4.p1":
      "The Site uses cookies and similar technologies to support account sign-in, remember your theme and language, and collect traffic statistics via Yandex.Metrica and Google Analytics. These services may set their own cookies in accordance with their privacy policies.",
    "privacy.s4.p2":
      "You can disable cookies in your browser settings, but this may limit the operation of the Site, including signing in to your account.",

    "privacy.s5.h": "5. Transfer of Data to Third Parties",
    "privacy.s5.p1":
      "The Operator does not sell or transfer personal data to third parties, except for:",
    "privacy.s5.li1":
      "services that ensure the technical operation of the Site (hosting, email delivery, analytics);",
    "privacy.s5.li2": "cases provided for by the laws of the Russian Federation.",
    "privacy.s5.p2":
      "Profile data that you yourself make public (name, avatar, ideas, comments) is visible to other users and visitors of the Site — this does not constitute a transfer to third parties within the meaning of this Policy.",

    "privacy.s6.h": "6. Data Storage and Protection",
    "privacy.s6.p1":
      "Passwords are stored in irreversibly hashed form and are never processed in plain text. Data is stored on servers with restricted access. The retention period lasts until the account is deleted or until processing is no longer necessary.",

    "privacy.s7.h": "7. Your Rights",
    "privacy.s7.p1": "You may at any time:",
    "privacy.s7.li1": "change or delete your profile data in your personal account;",
    "privacy.s7.li2": "change or delete your payment details in the “Finance” section;",
    "privacy.s7.li3":
      "request complete deletion of your account and the personal data associated with it by contacting support;",
    "privacy.s7.li4":
      "withdraw your consent to data processing, which will make further use of the Site impossible.",

    "privacy.s8.h": "8. Changes to the Policy",
    "privacy.s8.p1":
      "The Operator may make changes to this Policy. The current version is always available on this page.",

    "privacy.s9.h": "9. Contacts",
    "privacy.s9.p1":
      "For questions about the processing of personal data, please use the support section in your personal account.",
  },

  cn: {
    // ---------- Terms ----------
    "terms.translationNote": "本译文仅供参考，以俄文版本为准。",
    "terms.title": "用户协议",
    "terms.effective": "自 2026 年 8 月 1 日起生效",
    "terms.box.title": "注册前需要了解的要点",
    "terms.box.subj": "平台",
    "terms.box.li1b": "不承担责任",
    "terms.box.li1c":
      "，对所发布内容本身及基于这些内容进行交易的结果概不负责——此处的观点是作者的个人意见，而非投资建议。",
    "terms.box.li2b": "不出售任何东西",
    "terms.box.li2c":
      "：付费观点和订阅由一名用户直接向另一名用户付款，不经过平台。平台不是这些结算的一方，也不保管资金。",
    "terms.box.li3b": "不强制任何人承担任何义务",
    "terms.box.li3c":
      "——发布、购买和订阅频道完全出于自愿，平台既不能免除任何一方遵守相关条件的义务，也不能强迫任何一方履行。",
    "terms.box.li4b": "不是投资顾问、经纪商或交易组织者",
    "terms.box.li4c": "，也不提供交易建议。",
    "terms.box.more": "详见下文第 4、5、9 条。",

    "terms.s1.h": "1. 协议标的",
    "terms.s1.p1a":
      "本协议调整 FOMO 平台管理者（以下简称“平台”）与任何使用平台的人士（以下简称“用户”）之间的关系。在平台注册即表示您确认已阅读并接受本协议以及",
    "terms.s1.link": "《个人数据处理政策》",
    "terms.s1.p1c": "的条款。",

    "terms.s2.h": "2. FOMO 是什么",
    "terms.s2.p1":
      "FOMO 是一个发布和讨论金融工具（股票、期货、加密货币和货币对）交易观点的平台。用户可以免费或付费发布观点、运营付费频道，并在聊天中讨论交易品种。",

    "terms.s3.h": "3. 注册与账号",
    "terms.s3.li1": "注册仅向年满 18 周岁且具有完全民事行为能力的人士开放；",
    "terms.s3.li2": "每人仅可拥有一个账号；禁止创建重复账号；",
    "terms.s3.li3": "您须对密码的安全以及以您账号进行的一切操作负责；",
    "terms.s3.li4": "如违反本协议，平台有权封禁账号。",

    "terms.s4.h": "4. 发布内容——需要特别了解",
    "terms.s4.p1b": "平台上发布的内容为其作者的个人意见，不构成个性化投资建议",
    "terms.s4.p1c":
      "（依据 22.04.1996 第 39-FZ 号联邦法《证券市场法》的含义）。平台不是投资顾问、经纪商或交易组织者。",
    "terms.s4.p2":
      "是否进行交易由您自行决定并自担风险。观点作者和平台管理方均不对依据已发布材料所获得的财务结果承担责任。",

    "terms.s5.h": "5. 付费材料及用户之间的结算",
    "terms.s5.li1": "观点和频道订阅的款项由作为买方的用户按作者提供的收款信息直接支付给作为作者的用户；",
    "terms.s5.li2": "平台不是这些结算的一方，不扣留、不保管资金，也不对销售收取佣金；",
    "terms.s5.li3": "付款确认及开放材料访问权限由作者自行完成；",
    "terms.s5.li4":
      "付款争议由买方与作者直接解决；平台可协助处理投诉，但不保证退款，因为平台从未收到过这些资金；",
    "terms.s5.li5": "付费频道订阅在已付费期限届满前有效，不会自动续期。",

    "terms.s6.h": "6. 评分及付费发布限制",
    "terms.s6.p1":
      "作者评分根据活跃度和用户反馈自动计算。能否发布付费观点和创建付费频道取决于评分。平台可在不事先通知的情况下修改计算规则；修改适用于今后的操作，不会降低已公布的结果。",

    "terms.s7.h": "7. 行为与交流规则",
    "terms.s7.p1":
      "注册即表示用户承诺在平台的观点、评论和聊天中保持礼貌和尊重的语气——无论其是否同意他人的交易观点。",
    "terms.s7.forbidden": "平台禁止以下行为：",
    "terms.s7.li1b": "污言秽语",
    "terms.s7.li1c": "及其变相形式（星号、音译、在词中插入空格等）；",
    "terms.s7.li2b": "侮辱、贬低和人身攻击",
    "terms.s7.li2c": "——包括针对用户不认同的观点作者；",
    "terms.s7.li3b": "针对其他用户的欺凌、骚扰和威胁",
    "terms.s7.li3c": "；",
    "terms.s7.li4": "基于民族、宗教、性别、年龄或其他身份煽动仇恨；",
    "terms.s7.li5b": "与市场分析无关的政治和宗教讨论",
    "terms.s7.li5c":
      "——宣传鼓动、政治观点争论、对政党和人物的评价。分析某一具体政治或宏观经济事件（制裁、央行决议、选举等）已经或可能对交易品种产生的影响，属于平台的正常工作内容，不受本条款约束；",
    "terms.s7.li6": "煽动暴力、极端主义或违法行为；",
    "terms.s7.li7": "垃圾信息和刷屏：重复消息、无意义评论、在聊天中刷活跃度；",
    "terms.s7.li8": "讨论和出售与金融市场无关的话题（包括通过私信）；",
    "terms.s7.li9": "发布惊悚内容、18+ 材料以及任何俄罗斯联邦法律禁止的内容。",
    "terms.s7.p2":
      "审核人员有权在不事先警告的情况下隐藏违反规则的消息或观点。系统性违规将导致账号被临时限制，屡次违规将被封禁，已在平台上花费的资金不予退还。",

    "terms.s8.h": "8. 禁止行为",
    "terms.s8.li1": "保证收益或承诺具体的财务结果；",
    "terms.s8.li2": "以自己的名义发布他人的材料；",
    "terms.s8.li3": "刷评分：创建虚假账号、串通互评、发布没有实质价值的观点；",
    "terms.s8.li4": "募集资金用于“信托管理”，邀请他人参与金融传销；",
    "terms.s8.li5": "未经同意为第三方服务投放广告；",
    "terms.s8.li6": "发布第三方的个人数据、侮辱、威胁；",
    "terms.s8.li7": "绕过平台的付款申请机制要求预付款；",
    "terms.s8.li8": "使用自动化手段批量注册账号或规避技术限制。",
    "terms.s8.p1": "违规将导致材料被隐藏、账号被限制或封禁。通过刷分获得的评分将被取消。",

    "terms.s9.h": "9. 知识产权",
    "terms.s9.p1":
      "在平台上发布材料，即表示您保留该材料的著作权，并授予平台在服务范围内展示该材料的非独占许可。未经权利人许可，禁止使用他人的文字和图片。",

    "terms.s10.h": "10. 责任限制",
    "terms.s10.p1":
      "平台按“现状”提供。平台仅作为展示窗口和技术场所：展示发布内容、连接用户并传递通知。平台不出售、不购买、不保管也不担保用户之间交换的任何东西，也不强制任何一方履行通过平台达成的约定。",
    "terms.s10.p2":
      "管理方不保证网站不间断运行，不保证交易终端中行情的准确性（行情仅供参考，可能滞后于交易所数据），也不对其他用户的行为负责，包括不履行付款义务、其提供的信息不实或所发布观点的质量。",

    "terms.s11.h": "11. 协议变更",
    "terms.s11.p1": "管理方有权变更协议条款。变更公布后继续使用平台，即表示同意新版本。",

    "terms.s12.h": "12. 联系方式",
    "terms.s12.p1": "如对本协议有任何疑问，请通过个人中心的客服联系我们。",

    // ---------- Privacy ----------
    "privacy.translationNote": "本译文仅供参考，以俄文版本为准。",
    "privacy.title": "个人数据处理政策",
    "privacy.effective": "自 2026 年 8 月 1 日起生效",

    "privacy.s1.h": "1. 总则",
    "privacy.s1.p1":
      "本政策依据 27.07.2006 第 152-FZ 号联邦法《个人数据法》，规定 fomo.spot 网站（以下简称“网站”、“FOMO”）用户个人数据的处理程序。",
    "privacy.s1.p2":
      "个人数据处理的运营者为自然人——网站管理者（以下简称“运营者”）。使用网站即表示您同意本政策的条款。",

    "privacy.s2.h": "2. 我们收集哪些数据",
    "privacy.s2.p1": "在您注册和使用网站时，运营者可能处理：",
    "privacy.s2.li1": "电子邮箱地址——用于注册、登录以及与您联系；",
    "privacy.s2.li2": "用户名、头像、个人简介和专长——如您已填写；",
    "privacy.s2.li3": "城市、工作单位、交易经验、出生日期——如您已填写；",
    "privacy.s2.li4":
      "收款信息（卡号、YooKassa 数据）——如您设置付费频道或付费观点。这些数据由您自行输入，仅您本人可见，且仅用于在您的套餐中显示；",
    "privacy.s2.li5": "技术信息：IP 地址、Cookie、设备和浏览器数据、在网站上的操作记录。",
    "privacy.s2.p2":
      "网站不索取也不存储买家的银行卡数据——观点和订阅的付款在用户之间直接进行，不经过网站的支付基础设施。",

    "privacy.s3.h": "3. 处理目的",
    "privacy.s3.li1": "在网站上注册和授权登录；",
    "privacy.s3.li2": "向其他用户展示您的个人资料和发布内容；",
    "privacy.s3.li3": "发送验证码、付款申请通知及其他技术性邮件；",
    "privacy.s3.li4": "防范欺诈、垃圾信息和大规模自动注册；",
    "privacy.s3.li5": "基于访问量分析改进网站运行；",
    "privacy.s3.li6": "处理客服请求。",

    "privacy.s4.h": "4. Cookie 与分析",
    "privacy.s4.p1":
      "网站使用 Cookie 及类似技术来实现账号登录、记住界面主题和语言，并通过 Yandex.Metrica 和 Google Analytics 统计访问量。这些服务可能根据其各自的隐私政策设置自己的 Cookie。",
    "privacy.s4.p2": "您可以在浏览器设置中禁用 Cookie，但这可能会限制网站的运行，包括账号登录。",

    "privacy.s5.h": "5. 向第三方提供数据",
    "privacy.s5.p1": "运营者不出售也不向第三方提供个人数据，但以下情况除外：",
    "privacy.s5.li1": "保障网站技术运行的服务（托管、邮件发送、分析）；",
    "privacy.s5.li2": "俄罗斯联邦法律规定的情形。",
    "privacy.s5.p2":
      "您自行公开的个人资料数据（用户名、头像、观点、评论）对网站的其他用户和访客可见——这不属于本政策意义上的向第三方提供数据。",

    "privacy.s6.h": "6. 数据存储与保护",
    "privacy.s6.p1":
      "密码以不可逆的哈希形式存储，绝不以明文形式处理。数据存储在访问受限的服务器上。存储期限为直至账号删除或直至不再需要处理为止。",

    "privacy.s7.h": "7. 您的权利",
    "privacy.s7.p1": "您可随时：",
    "privacy.s7.li1": "在个人中心修改或删除您的个人资料数据；",
    "privacy.s7.li2": "在“财务”栏目中更改或删除收款信息；",
    "privacy.s7.li3": "联系客服，申请完全删除账号及与之相关的个人数据；",
    "privacy.s7.li4": "撤回对数据处理的同意，这将导致无法继续使用网站。",

    "privacy.s8.h": "8. 政策变更",
    "privacy.s8.p1": "运营者有权对本政策进行修改。最新版本始终可在本页面查阅。",

    "privacy.s9.h": "9. 联系方式",
    "privacy.s9.p1": "如对个人数据处理有任何疑问，请通过个人中心的客服栏目联系我们。",
  },
};

export default dict;
