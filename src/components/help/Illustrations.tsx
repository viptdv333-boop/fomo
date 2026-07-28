/**
 * Diagrams for the knowledge base.
 *
 * Drawn as inline SVG rather than captured as screenshots: they follow the
 * light/dark theme, stay sharp at any size, add no network requests, and — the
 * real reason — they don't silently go stale the next time a button moves.
 */

const card = "fill-white dark:fill-gray-800";
const border = "stroke-gray-200 dark:stroke-gray-700";
const muted = "fill-gray-100 dark:fill-gray-700";
const label = "fill-gray-500 dark:fill-gray-400";
const strong = "fill-gray-900 dark:fill-gray-100";
const accent = "fill-green-600";

function Frame({ children, viewBox }: { children: React.ReactNode; viewBox: string }) {
  return (
    <svg
      viewBox={viewBox}
      className="w-full h-auto my-6 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50"
      role="img"
    >
      {children}
    </svg>
  );
}

/** Three steps of signing up. */
export function RegistrationSteps() {
  const steps = [
    { n: "1", t: "Почта", d: "Вводите адрес" },
    { n: "2", t: "Код", d: "6 цифр из письма" },
    { n: "3", t: "Профиль", d: "Имя и пароль" },
  ];
  return (
    <Frame viewBox="0 0 600 130">
      <title>Три шага регистрации: почта, код из письма, имя и пароль</title>
      {steps.map((s, i) => {
        const x = 30 + i * 190;
        return (
          <g key={s.n}>
            {i < 2 && (
              <line
                x1={x + 150}
                y1={62}
                x2={x + 185}
                y2={62}
                className="stroke-gray-300 dark:stroke-gray-600"
                strokeWidth={2}
                strokeDasharray="4 4"
              />
            )}
            <rect x={x} y={25} width={150} height={75} rx={12} className={`${card} ${border}`} strokeWidth={1.5} />
            <circle cx={x + 28} cy={52} r={14} className={accent} />
            <text x={x + 28} y={57} textAnchor="middle" className="fill-white text-[13px] font-bold">
              {s.n}
            </text>
            <text x={x + 52} y={50} className={`${strong} text-[14px] font-semibold`}>
              {s.t}
            </text>
            <text x={x + 52} y={70} className={`${label} text-[11px]`}>
              {s.d}
            </text>
          </g>
        );
      })}
      <text x={300} y={118} textAnchor="middle" className={`${label} text-[11px]`}>
        Аккаунт активен сразу — модерация не нужна
      </text>
    </Frame>
  );
}

/** The four tabs of the personal cabinet. */
export function CabinetTabs() {
  const tabs = ["Профиль", "Финансы", "Мои идеи", "Безопасность"];
  const rows = [
    "Способы оплаты",
    "Мои каналы",
    "Мои подписки",
    "Мои покупки и продажи",
  ];
  return (
    <Frame viewBox="0 0 600 250">
      <title>Личный кабинет: вкладки Профиль, Финансы, Мои идеи, Безопасность</title>
      <rect x={20} y={20} width={560} height={210} rx={14} className={`${card} ${border}`} strokeWidth={1.5} />
      {tabs.map((t, i) => {
        const x = 36 + i * 134;
        const active = i === 1;
        return (
          <g key={t}>
            <rect
              x={x}
              y={36}
              width={124}
              height={32}
              rx={8}
              className={active ? accent : muted}
            />
            <text
              x={x + 62}
              y={57}
              textAnchor="middle"
              className={`${active ? "fill-white" : label} text-[12px] font-medium`}
            >
              {t}
            </text>
          </g>
        );
      })}
      {rows.map((r, i) => (
        <g key={r}>
          <rect x={36} y={90 + i * 33} width={528} height={26} rx={7} className={muted} />
          <circle cx={52} cy={103 + i * 33} r={4} className={accent} />
          <text x={68} y={107 + i * 33} className={`${strong} text-[12px]`}>
            {r}
          </text>
        </g>
      ))}
      <text x={300} y={240} textAnchor="middle" className={`${label} text-[11px]`}>
        Вкладка «Финансы» — всё о деньгах в одном месте
      </text>
    </Frame>
  );
}

/** Rating scale with the thresholds that unlock features. */
export function RatingScale() {
  const marks = [
    { v: 1, x: 40 },
    { v: 3, x: 175 },
    { v: 5, x: 310 },
    { v: 7, x: 445 },
    { v: 10, x: 560 },
  ];
  return (
    <Frame viewBox="0 0 600 190">
      <title>Шкала рейтинга: пороги 3, 5 и 7 баллов открывают платные возможности</title>
      <rect x={40} y={60} width={135} height={18} rx={4} className="fill-gray-300 dark:fill-gray-600" />
      <rect x={175} y={60} width={135} height={18} rx={0} className="fill-green-300 dark:fill-green-900" />
      <rect x={310} y={60} width={135} height={18} rx={0} className="fill-green-400 dark:fill-green-700" />
      <rect x={445} y={60} width={115} height={18} rx={4} className={accent} />

      {marks.map((m) => (
        <g key={m.v}>
          <line x1={m.x} y1={54} x2={m.x} y2={84} className="stroke-gray-400 dark:stroke-gray-500" strokeWidth={1.5} />
          <text x={m.x} y={46} textAnchor="middle" className={`${strong} text-[12px] font-semibold`}>
            {m.v}
          </text>
        </g>
      ))}

      <text x={107} y={104} textAnchor="middle" className={`${label} text-[11px]`}>платных идей нет</text>
      <text x={242} y={104} textAnchor="middle" className={`${label} text-[11px]`}>3 в неделю</text>
      <text x={377} y={104} textAnchor="middle" className={`${label} text-[11px]`}>10 в неделю</text>
      <text x={502} y={104} textAnchor="middle" className={`${label} text-[11px]`}>без лимита</text>

      <line x1={310} y1={124} x2={310} y2={140} className="stroke-green-600" strokeWidth={1.5} />
      <text x={318} y={144} className="fill-green-700 dark:fill-green-400 text-[12px] font-medium">
        от 5.0 — можно создать платный канал
      </text>
      <text x={40} y={172} className={`${label} text-[11px]`}>
        Стартовый рейтинг нового автора — 3.0
      </text>
    </Frame>
  );
}

/** How money moves between reader and author. */
export function PaymentFlow() {
  const steps = [
    { t: "Покупатель", d: "нажимает «Купить»" },
    { t: "Перевод", d: "по реквизитам автора" },
    { t: "Чек", d: "прикладывает к заявке" },
    { t: "Автор", d: "подтверждает" },
    { t: "Доступ", d: "открывается" },
  ];
  return (
    <Frame viewBox="0 0 600 170">
      <title>Как проходит оплата: заявка, перевод, чек, подтверждение автором, доступ</title>
      {steps.map((s, i) => {
        const x = 18 + i * 115;
        const last = i === steps.length - 1;
        return (
          <g key={s.t}>
            {i < steps.length - 1 && (
              <path
                d={`M ${x + 100} 62 L ${x + 113} 62`}
                className="stroke-gray-400 dark:stroke-gray-500"
                strokeWidth={1.5}
                markerEnd="url(#arrow)"
              />
            )}
            <rect
              x={x}
              y={28}
              width={100}
              height={68}
              rx={10}
              className={last ? "fill-green-50 dark:fill-green-900/30 stroke-green-500" : `${card} ${border}`}
              strokeWidth={1.5}
            />
            <text x={x + 50} y={56} textAnchor="middle" className={`${last ? "fill-green-700 dark:fill-green-400" : strong} text-[12px] font-semibold`}>
              {s.t}
            </text>
            <text x={x + 50} y={76} textAnchor="middle" className={`${label} text-[10px]`}>
              {s.d}
            </text>
          </g>
        );
      })}
      <defs>
        <marker id="arrow" markerWidth={6} markerHeight={6} refX={5} refY={3} orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" className="fill-gray-400 dark:fill-gray-500" />
        </marker>
      </defs>
      <text x={300} y={128} textAnchor="middle" className={`${label} text-[11px]`}>
        Деньги идут напрямую от читателя к автору — площадка их не держит
      </text>
      <text x={300} y={150} textAnchor="middle" className="fill-green-700 dark:fill-green-400 text-[13px] font-semibold">
        Комиссия FOMO — 0%
      </text>
    </Frame>
  );
}

/** A channel card with two tariffs. */
export function ChannelCard() {
  return (
    <Frame viewBox="0 0 600 235">
      <title>Карточка канала с двумя тарифами: месяц и год</title>
      <rect x={20} y={20} width={560} height={195} rx={14} className={`${card} ${border}`} strokeWidth={1.5} />
      <rect x={40} y={40} width={54} height={54} rx={12} className={muted} />
      <text x={67} y={73} textAnchor="middle" className={`${label} text-[10px]`}>лого</text>

      <text x={110} y={58} className={`${strong} text-[15px] font-bold`}>Нефть и газ каждый день</text>
      <text x={110} y={78} className={`${label} text-[11px]`}>Разбор Brent и Henry Hub перед открытием</text>
      <rect x={110} y={86} width={54} height={18} rx={9} className="fill-green-100 dark:fill-green-900/40" />
      <text x={137} y={99} textAnchor="middle" className="fill-green-700 dark:fill-green-400 text-[10px]">#нефть</text>
      <rect x={170} y={86} width={44} height={18} rx={9} className="fill-green-100 dark:fill-green-900/40" />
      <text x={192} y={99} textAnchor="middle" className="fill-green-700 dark:fill-green-400 text-[10px]">#газ</text>

      <line x1={40} y1={120} x2={560} y2={120} className="stroke-gray-200 dark:stroke-gray-700" strokeWidth={1} />

      {[
        { n: "Месяц", p: "1 500 ₽", d: "30 дней", x: 40 },
        { n: "Год", p: "12 000 ₽", d: "365 дней", x: 310 },
      ].map((t) => (
        <g key={t.n}>
          <rect x={t.x} y={135} width={250} height={62} rx={10} className={muted} />
          <text x={t.x + 18} y={160} className={`${strong} text-[13px] font-semibold`}>{t.n}</text>
          <text x={t.x + 18} y={180} className={`${label} text-[11px]`}>{t.d}</text>
          <text x={t.x + 232} y={168} textAnchor="end" className="fill-green-700 dark:fill-green-400 text-[15px] font-bold">
            {t.p}
          </text>
        </g>
      ))}
    </Frame>
  );
}

/** Free idea vs paid idea — what the reader sees. */
export function FreeVsPaid() {
  return (
    <Frame viewBox="0 0 600 210">
      <title>Разница между бесплатной и платной идеей: у платной виден только заголовок и превью</title>
      {[
        { title: "Бесплатная", paid: false, x: 20 },
        { title: "Платная", paid: true, x: 310 },
      ].map((c) => (
        <g key={c.title}>
          <rect x={c.x} y={20} width={270} height={170} rx={14} className={`${card} ${border}`} strokeWidth={1.5} />
          <text x={c.x + 20} y={46} className={`${strong} text-[13px] font-bold`}>{c.title}</text>

          <rect x={c.x + 20} y={58} width={200} height={10} rx={5} className="fill-gray-300 dark:fill-gray-600" />
          <rect x={c.x + 20} y={76} width={230} height={7} rx={3.5} className={muted} />
          <rect x={c.x + 20} y={89} width={210} height={7} rx={3.5} className={muted} />

          {c.paid ? (
            <>
              <rect x={c.x + 20} y={106} width={230} height={44} rx={8} className="fill-gray-200 dark:fill-gray-700" />
              <text x={c.x + 135} y={125} textAnchor="middle" className={`${label} text-[11px]`}>
                текст скрыт
              </text>
              <text x={c.x + 135} y={141} textAnchor="middle" className={`${label} text-[10px]`}>
                откроется после оплаты
              </text>
              <rect x={c.x + 20} y={158} width={110} height={22} rx={11} className={accent} />
              <text x={c.x + 75} y={173} textAnchor="middle" className="fill-white text-[11px] font-medium">
                Купить
              </text>
            </>
          ) : (
            <>
              <rect x={c.x + 20} y={106} width={230} height={7} rx={3.5} className={muted} />
              <rect x={c.x + 20} y={119} width={215} height={7} rx={3.5} className={muted} />
              <rect x={c.x + 20} y={132} width={190} height={7} rx={3.5} className={muted} />
              <rect x={c.x + 20} y={145} width={225} height={7} rx={3.5} className={muted} />
              <text x={c.x + 20} y={175} className="fill-green-700 dark:fill-green-400 text-[11px]">
                читают все, включая гостей
              </text>
            </>
          )}
        </g>
      ))}
    </Frame>
  );
}
