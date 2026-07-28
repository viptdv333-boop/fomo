import type { Metadata } from "next";
import Link from "next/link";
import {
  RegistrationSteps,
  CabinetTabs,
  RatingScale,
  PaymentFlow,
  ChannelCard,
  FreeVsPaid,
} from "@/components/help/Illustrations";

const SITE_URL = "https://fomo.spot";

export const metadata: Metadata = {
  title: "Как пользоваться FOMO — регистрация, публикация идей, платные каналы",
  description:
    "Полная инструкция по FOMO: как зарегистрироваться, публиковать торговые идеи, продавать прогнозы, создать платный канал, подключить приём оплаты. Комиссия площадки — 0%.",
  keywords: [
    "как публиковать торговые идеи",
    "как продавать прогнозы трейдера",
    "платный канал трейдера",
    "монетизация торговых сигналов",
    "инструкция FOMO",
  ],
  alternates: { canonical: `${SITE_URL}/help` },
  openGraph: {
    url: `${SITE_URL}/help`,
    title: "Как пользоваться FOMO — полная инструкция",
    description:
      "Регистрация, публикация идей, платные каналы, приём оплаты и рейтинг автора. Комиссия площадки — 0%.",
  },
};

// FAQPage markup: these questions are exactly what people type into search,
// and the answers can surface directly in results.
const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "Какую комиссию берёт FOMO с продаж?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Нулевую. Читатель платит автору напрямую по его реквизитам, площадка в расчётах не участвует и денег не удерживает.",
      },
    },
    {
      "@type": "Question",
      name: "Кто может публиковать торговые идеи?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Бесплатные идеи может публиковать любой зарегистрированный пользователь с первого дня, без ограничений по рейтингу.",
      },
    },
    {
      "@type": "Question",
      name: "Какой рейтинг нужен, чтобы создать платный канал?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "5.0 и выше. Платные идеи открываются раньше — с 3.0, но с лимитом три штуки в неделю.",
      },
    },
    {
      "@type": "Question",
      name: "Сколько стоит пользоваться FOMO?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Регистрация, чтение бесплатных идей, чаты и торговый терминал бесплатны. Платить нужно только автору за его платные материалы.",
      },
    },
  ],
};

const SECTIONS = [
  { id: "start", title: "С чего начать" },
  { id: "registration", title: "Регистрация" },
  { id: "cabinet", title: "Личный кабинет" },
  { id: "ideas", title: "Публикация идей" },
  { id: "rating", title: "Рейтинг автора" },
  { id: "paid-ideas", title: "Платные идеи" },
  { id: "channels", title: "Каналы" },
  { id: "payments", title: "Приём оплаты" },
  { id: "commission", title: "Комиссии" },
  { id: "terminal", title: "Инструменты и терминал" },
  { id: "rules", title: "Правила" },
  { id: "faq", title: "Частые вопросы" },
];

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 mb-14">
      <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-gray-100">{title}</h2>
      <div className="space-y-4 text-[15px] leading-relaxed text-gray-700 dark:text-gray-300">
        {children}
      </div>
    </section>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-l-[3px] border-green-500 bg-green-50 dark:bg-green-900/20 rounded-r-lg px-4 py-3 text-[14px] text-gray-700 dark:text-gray-300">
      {children}
    </div>
  );
}

function Warn({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-l-[3px] border-amber-500 bg-amber-50 dark:bg-amber-900/20 rounded-r-lg px-4 py-3 text-[14px] text-gray-700 dark:text-gray-300">
      {children}
    </div>
  );
}

function Steps({ items }: { items: { t: string; d: React.ReactNode }[] }) {
  return (
    <ol className="space-y-3">
      {items.map((s, i) => (
        <li key={s.t} className="flex gap-3">
          <span className="shrink-0 w-6 h-6 rounded-full bg-green-600 text-white text-[12px] font-bold flex items-center justify-center mt-0.5">
            {i + 1}
          </span>
          <span>
            <span className="font-semibold text-gray-900 dark:text-gray-100">{s.t}</span>
            {s.d && <span className="block text-[14px] mt-0.5">{s.d}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}

export default function HelpPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(faqJsonLd).replace(/</g, "\\u003c"),
        }}
      />

      <div className="max-w-6xl mx-auto px-4 py-8">
        <header className="mb-10">
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-gray-100">
            Как пользоваться FOMO
          </h1>
          <p className="mt-3 text-lg text-gray-600 dark:text-gray-400 max-w-2xl">
            Всё, что нужно знать: от регистрации до продажи прогнозов. Читается за десять минут,
            дальше можно возвращаться к нужному разделу.
          </p>
        </header>

        <div className="lg:grid lg:grid-cols-[220px_1fr] lg:gap-12">
          {/* Оглавление */}
          <nav className="mb-10 lg:mb-0">
            <div className="lg:sticky lg:top-24">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-3">
                Содержание
              </p>
              <ul className="space-y-1.5">
                {SECTIONS.map((s) => (
                  <li key={s.id}>
                    <a
                      href={`#${s.id}`}
                      className="text-[14px] text-gray-600 dark:text-gray-400 hover:text-green-600 dark:hover:text-green-400 transition"
                    >
                      {s.title}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </nav>

          <main>
            <Section id="start" title="С чего начать">
              <p>
                FOMO — площадка, где трейдеры публикуют торговые идеи по конкретным инструментам,
                обсуждают их и продают доступ к своей аналитике. Читатель находит авторов с
                проверяемой историей прогнозов, автор получает аудиторию и возможность заработать
                на том, что и так пишет.
              </p>
              <p>Три вещи, которые стоит понять сразу:</p>
              <ul className="list-disc pl-5 space-y-1.5">
                <li>
                  <b className="text-gray-900 dark:text-gray-100">Публиковать может каждый.</b>{" "}
                  Бесплатные идеи доступны с первого дня без всяких порогов.
                </li>
                <li>
                  <b className="text-gray-900 dark:text-gray-100">Деньги идут напрямую автору.</b>{" "}
                  Площадка не берёт комиссию и не держит ваши средства.
                </li>
                <li>
                  <b className="text-gray-900 dark:text-gray-100">Рейтинг — это репутация.</b> Он
                  считается автоматически и открывает платные возможности.
                </li>
              </ul>
              <Note>
                Публикации на FOMO — частные мнения, а не инвестиционные рекомендации. Решение о
                сделке всегда остаётся за вами.
              </Note>
            </Section>

            <Section id="registration" title="Регистрация">
              <p>Занимает минуту, одобрение администратора не требуется.</p>
              <RegistrationSteps />
              <Steps
                items={[
                  {
                    t: "Введите почту",
                    d: "На странице регистрации укажите адрес и подтвердите, что вы не робот.",
                  },
                  {
                    t: "Заберите код из письма",
                    d: "Придёт шестизначный код с адреса no-reply@fomo.spot. Он действует 15 минут. Если письма нет — проверьте «Спам».",
                  },
                  {
                    t: "Придумайте имя и пароль",
                    d: "Пароль — от 8 символов. Слишком простые и часто встречающиеся пароли система не примет.",
                  },
                ]}
              />
              <Warn>
                Повторно запросить код можно раз в минуту, а пять неверных попыток ввода гасят код —
                придётся запросить новый. Это защита от подбора, а не придирка.
              </Warn>
              <p>
                Сайт можно поставить как приложение: откройте его в браузере телефона и выберите
                «Добавить на главный экран».
              </p>
            </Section>

            <Section id="cabinet" title="Личный кабинет">
              <p>
                Всё управление собрано в <Link href="/profile" className="text-green-600 hover:underline">профиле</Link>,
                на четырёх вкладках.
              </p>
              <CabinetTabs />
              <div className="grid sm:grid-cols-2 gap-4">
                {[
                  {
                    t: "Профиль",
                    d: "Имя, аватар, описание, специализация, город, опыт на бирже. Это то, что видят читатели.",
                  },
                  {
                    t: "Финансы",
                    d: "Способы оплаты, ваши каналы, подписки, покупки и продажи, расходы. Главная вкладка для автора.",
                  },
                  {
                    t: "Мои идеи",
                    d: "Список ваших публикаций. Здесь же удаление — по одной или все сразу.",
                  },
                  {
                    t: "Безопасность",
                    d: "Смена пароля и почты. Смена пароля завершает все остальные сессии.",
                  },
                ].map((c) => (
                  <div
                    key={c.t}
                    className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 bg-white dark:bg-gray-800"
                  >
                    <p className="font-semibold text-gray-900 dark:text-gray-100 mb-1">{c.t}</p>
                    <p className="text-[14px] text-gray-600 dark:text-gray-400">{c.d}</p>
                  </div>
                ))}
              </div>
            </Section>

            <Section id="ideas" title="Публикация идей">
              <p>
                Кнопка «Создать идею» доступна прямо на доске, когда вы вошли в аккаунт.
                <b className="text-gray-900 dark:text-gray-100"> Ограничений по рейтингу для
                бесплатных идей нет</b> — публикуйте с первого дня.
              </p>
              <Steps
                items={[
                  { t: "Заголовок", d: "Коротко и по делу: инструмент и суть движения." },
                  {
                    t: "Превью",
                    d: "Свободный текст, который видят все. У платной идеи это витрина — по нему решают, покупать ли.",
                  },
                  { t: "Полный контент", d: "Аргументация, уровни входа и выхода, скриншоты графиков." },
                  {
                    t: "Инструменты",
                    d: "Отметьте бумаги, о которых речь. По этим тегам идею находят в ленте и на страницах инструментов.",
                  },
                ]}
              />
              <Note>
                Теги — не украшение. Читатели фильтруют ленту по своим инструментам, и идея без
                правильных тегов до них просто не дойдёт. Отмечайте только то, о чём действительно
                пишете.
              </Note>
              <p>
                Ограничение одно: не больше 10 публикаций в час. Оно защищает ленту от флуда и в
                обычной работе не мешает.
              </p>
            </Section>

            <Section id="rating" title="Рейтинг автора">
              <p>
                Рейтинг считается автоматически и показывается звёздами. Он определяет, что вам
                доступно, и помогает читателям выбирать, кого читать.
              </p>
              <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 font-mono text-[13px] leading-relaxed overflow-x-auto">
                <div className="text-gray-900 dark:text-gray-100">рейтинг = 3.0 — стартовое значение</div>
                <div className="text-green-700 dark:text-green-400">+ 0.05 × опубликованных идей (максимум +2.0)</div>
                <div className="text-green-700 dark:text-green-400">+ 0.30 × подписчиков</div>
                <div className="text-green-700 dark:text-green-400">+ 0.10 × лайков</div>
                <div className="text-red-600 dark:text-red-400">− 0.15 × дизлайков</div>
                <div className="text-red-600 dark:text-red-400">− 0.05 × дней простоя сверх недели</div>
                <div className="text-gray-500 dark:text-gray-400 mt-1">итог ограничен диапазоном 1.0 — 10.0</div>
              </div>
              <RatingScale />
              <p>
                Пересчёт происходит при публикации, оценке, подписке и отписке.{" "}
                <b className="text-gray-900 dark:text-gray-100">Публикация никогда не понижает
                рейтинг</b> — только повышает.
              </p>
              <Warn>
                Штраф за простой: первая неделя после последней публикации бесплатна, дальше рейтинг
                снижается на 0.05 в день. Опубликуйте новую идею — отсчёт начнётся заново. Логика в
                том, что рейтинг показывает не только качество, но и то, что автор в рынке сейчас.
              </Warn>
            </Section>

            <Section id="paid-ideas" title="Платные идеи">
              <p>
                У платной идеи открыты заголовок и превью, а полный текст и вложения появляются
                после оплаты.
              </p>
              <FreeVsPaid />
              <p>Сколько платных идей можно публиковать — зависит от рейтинга:</p>
              <div className="overflow-x-auto">
                <table className="w-full text-[14px] border-collapse">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700">
                      <th className="text-left py-2.5 pr-4 font-semibold text-gray-900 dark:text-gray-100">Рейтинг</th>
                      <th className="text-left py-2.5 font-semibold text-gray-900 dark:text-gray-100">Платных идей в неделю</th>
                    </tr>
                  </thead>
                  <tbody className="text-gray-700 dark:text-gray-300">
                    {[
                      ["ниже 3.0", "нельзя"],
                      ["3.0 — 5.0", "до 3"],
                      ["5.0 — 7.0", "до 10"],
                      ["от 7.0", "без ограничений"],
                    ].map(([r, v]) => (
                      <tr key={r} className="border-b border-gray-100 dark:border-gray-800">
                        <td className="py-2.5 pr-4">{r}</td>
                        <td className="py-2.5">{v}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[14px] text-gray-600 dark:text-gray-400">
                Лимит считается по последним семи дням — это скользящее окно, а не календарная неделя.
              </p>
              <Note>
                На бесплатной идее можно включить приём донатов: читатель заплатит, только если сам
                захочет поблагодарить.
              </Note>
            </Section>

            <Section id="channels" title="Каналы: бесплатный и платный">
              <p>
                <b className="text-gray-900 dark:text-gray-100">Бесплатный канал</b> у вас уже есть —
                это ваш профиль. Любой читатель нажимает «Подписаться» и получает уведомления о ваших
                новых идеях. Ничего настраивать не нужно, порога по рейтингу нет.
              </p>
              <p>
                <b className="text-gray-900 dark:text-gray-100">Платный канал</b> — это подписка:
                читатель платит за период и получает доступ ко всем вашим платным материалам, пока
                она активна. У канала есть свой закрытый чат для подписчиков.
              </p>
              <ChannelCard />
              <p className="font-semibold text-gray-900 dark:text-gray-100">Как создать платный канал</p>
              <Steps
                items={[
                  {
                    t: "Наберите рейтинг 5.0",
                    d: "Ниже этого порога раздел недоступен. Публикуйте идеи и набирайте подписчиков.",
                  },
                  {
                    t: "Добавьте способ оплаты",
                    d: "Профиль → Финансы → Способы оплаты. Без него тариф не сохранить.",
                  },
                  {
                    t: "Создайте канал",
                    d: "Аватарка, название, описание и хэштеги — инструменты, по которым вы работаете.",
                  },
                  {
                    t: "Настройте тарифы",
                    d: "Название, цена в рублях, срок в днях и способ оплаты. Тарифов может быть несколько — например месяц и год.",
                  },
                ]}
              />
              <Warn>
                Подписка не продлевается автоматически. Она заканчивается в назначенный день, и
                доступ закрывается — читатель оформляет заново, если захочет продолжить.
              </Warn>
            </Section>

            <Section id="payments" title="Приём оплаты">
              <p>
                Реквизиты хранятся в профиле и подставляются в тарифы. Добавить их можно в разделе{" "}
                <b className="text-gray-900 dark:text-gray-100">Финансы → Способы оплаты</b>.
              </p>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 bg-white dark:bg-gray-800">
                  <p className="font-semibold text-gray-900 dark:text-gray-100 mb-1">Банковская карта</p>
                  <p className="text-[14px] text-gray-600 dark:text-gray-400">
                    Номер карты и понятное вам название вроде «Тинькофф *2977». Покупатель переводит
                    вам напрямую, вы подтверждаете поступление.
                  </p>
                </div>
                <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 bg-white dark:bg-gray-800">
                  <p className="font-semibold text-gray-900 dark:text-gray-100 mb-1">ЮKassa</p>
                  <p className="text-[14px] text-gray-600 dark:text-gray-400">
                    Идентификатор магазина и секретный ключ из личного кабинета ЮKassa. Подходит,
                    если у вас оформлено ИП или самозанятость.
                  </p>
                </div>
              </div>
              <p className="font-semibold text-gray-900 dark:text-gray-100 mt-2">Как проходит оплата</p>
              <PaymentFlow />
              <p>
                Покупатель нажимает «Купить» — создаётся заявка. Он переводит сумму по вашим
                реквизитам и прикладывает подтверждение платежа. Вам приходит уведомление, вы
                сверяете поступление и подтверждаете. Доступ открывается сразу, а для подписки
                одновременно открывается закрытый чат канала.
              </p>
              <p>
                Если денег не увидели — заявку можно отклонить. Все заявки видны в разделе{" "}
                <b className="text-gray-900 dark:text-gray-100">Финансы → Мои продажи</b>.
              </p>
              <Warn>
                Подтверждайте оплату быстро — покупатель ждёт доступ и видит только ваше молчание.
                Это самый частый повод для недовольства на площадках с прямыми расчётами.
              </Warn>
            </Section>

            <Section id="commission" title="Комиссии">
              <div className="rounded-2xl border-2 border-green-500 bg-green-50 dark:bg-green-900/20 p-6 text-center">
                <p className="text-4xl font-bold text-green-700 dark:text-green-400">0%</p>
                <p className="mt-2 text-gray-700 dark:text-gray-300">
                  FOMO не берёт комиссию с продаж идей и подписок
                </p>
              </div>
              <p>
                Расчёты идут напрямую между читателем и автором, площадка в них не участвует и денег
                не удерживает. Сколько указали в тарифе — столько и получили.
              </p>
              <p>
                Регистрация, чтение бесплатных идей, чаты и торговый терминал тоже бесплатны. Платить
                нужно только автору и только за платный материал.
              </p>
              <Warn>
                У прямых расчётов есть обратная сторона: при конфликте площадка не может вернуть
                деньги, потому что никогда их не получала. Поэтому перед покупкой смотрите на рейтинг
                автора и его прошлые публикации — это лучшая защита.
              </Warn>
            </Section>

            <Section id="terminal" title="Инструменты, терминал и чаты">
              <p>
                В каталоге больше 380 инструментов: все акции основного режима Московской биржи,
                топ-30 криптовалют, крупнейшие акции США, фьючерсы на нефть, газ, металлы и зерновые,
                индексы и валютные пары.
              </p>
              <p>
                <Link href="/terminal" className="text-green-600 hover:underline">Терминал</Link> показывает
                графики и котировки: российские бумаги и фьючерсы с Московской биржи, криптовалюты с
                Bybit, американские акции от внешнего провайдера.
              </p>
              <Warn>
                Котировки носят справочный характер и могут отставать от биржи. Торговые решения
                принимайте по данным своего брокера.
              </Warn>
              <p>
                У каждого актива есть свой{" "}
                <Link href="/chat" className="text-green-600 hover:underline">чат</Link> — нефть, золото,
                Сбербанк и так далее. Плюс личные сообщения и закрытые чаты платных каналов.
              </p>
            </Section>

            <Section id="rules" title="Правила">
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="rounded-xl border border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-900/10 p-4">
                  <p className="font-semibold text-green-800 dark:text-green-400 mb-2">Приветствуется</p>
                  <ul className="list-disc pl-5 space-y-1.5 text-[14px]">
                    <li>Идея с обоснованием: почему так, где вход, где признаёте себя неправым</li>
                    <li>Честный разбор своих ошибок — доверия это добавляет больше, чем серия удачных прогнозов</li>
                    <li>Точные теги инструментов</li>
                  </ul>
                </div>
                <div className="rounded-xl border border-red-200 dark:border-red-900 bg-red-50/50 dark:bg-red-900/10 p-4">
                  <p className="font-semibold text-red-700 dark:text-red-400 mb-2">Запрещено</p>
                  <ul className="list-disc pl-5 space-y-1.5 text-[14px]">
                    <li>Гарантии доходности в любом виде</li>
                    <li>Чужой материал под своим именем</li>
                    <li>Накрутка рейтинга: взаимные лайки по сговору, пустые идеи ради бонуса, фальшивые аккаунты</li>
                    <li>Сбор средств «в управление», финансовые пирамиды, реклама сторонних сервисов</li>
                    <li>Чужие персональные данные, оскорбления, травля</li>
                    <li>Требование предоплаты мимо механики заявок</li>
                  </ul>
                </div>
              </div>
              <p>
                Нарушение — материал скрывается модерацией, аккаунт ограничивается или блокируется.
                Рейтинг, полученный накруткой, обнуляется.
              </p>
            </Section>

            <Section id="faq" title="Частые вопросы">
              <div className="divide-y divide-gray-200 dark:divide-gray-700">
                {[
                  {
                    q: "Сколько стоит пользоваться FOMO?",
                    a: "Регистрация, чтение бесплатных идей, чаты и терминал — бесплатно. Платите только автору за его платный материал.",
                  },
                  {
                    q: "Нужно ли одобрение администратора при регистрации?",
                    a: "Нет. Аккаунт активен сразу после подтверждения почты.",
                  },
                  {
                    q: "Можно ли удалить свою идею?",
                    a: "Да, в разделе «Мои идеи»: крестик на каждой публикации и кнопка удаления всех сразу.",
                  },
                  {
                    q: "Почему рейтинг падает, если я ничего не делаю?",
                    a: "Это штраф за простой: через неделю после последней публикации рейтинг снижается на 0.05 в день. Новая идея обнуляет отсчёт.",
                  },
                  {
                    q: "Что делать, если автор не подтверждает оплату?",
                    a: "Напишите ему в личные сообщения — чаще всего это просто задержка. Если ответа нет, обратитесь в поддержку: мы примем меры к автору, но вернуть деньги площадка не может, так как их не получала.",
                  },
                  {
                    q: "Можно ли поменять почту или пароль?",
                    a: "Да, во вкладке «Безопасность». Смена пароля завершает все остальные сессии — если аккаунтом кто-то пользовался, он потеряет доступ.",
                  },
                  {
                    q: "Приходят ли ответы на письма от FOMO?",
                    a: "Нет, адрес no-reply@fomo.spot не принимает почту. По вопросам пишите в поддержку через профиль.",
                  },
                ].map((f) => (
                  <div key={f.q} className="py-4">
                    <p className="font-semibold text-gray-900 dark:text-gray-100 mb-1.5">{f.q}</p>
                    <p className="text-[14px] text-gray-600 dark:text-gray-400">{f.a}</p>
                  </div>
                ))}
              </div>
            </Section>

            <div className="rounded-2xl bg-gray-900 dark:bg-gray-800 p-8 text-center">
              <p className="text-xl font-bold text-white mb-2">Готовы опубликовать первую идею?</p>
              <p className="text-gray-400 text-[15px] mb-5">
                Регистрация занимает минуту, публиковать можно сразу
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Link
                  href="/register"
                  className="px-6 py-3 rounded-lg bg-green-600 text-white font-medium hover:bg-green-700 transition"
                >
                  Зарегистрироваться
                </Link>
                <Link
                  href="/feed"
                  className="px-6 py-3 rounded-lg border border-gray-600 text-gray-200 font-medium hover:bg-gray-800 transition"
                >
                  Смотреть идеи
                </Link>
              </div>
            </div>
          </main>
        </div>
      </div>
    </>
  );
}
