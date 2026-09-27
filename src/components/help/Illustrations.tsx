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

// Rendered from the server help page, so the translator is passed in as a prop.
export type TFn = (key: string, vars?: Record<string, string | number>) => string;
type Props = { t: TFn };

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
export function RegistrationSteps({ t }: Props) {
  const steps = [
    { n: "1", t: t("help.ill.reg.s1t"), d: t("help.ill.reg.s1d") },
    { n: "2", t: t("help.ill.reg.s2t"), d: t("help.ill.reg.s2d") },
    { n: "3", t: t("help.ill.reg.s3t"), d: t("help.ill.reg.s3d") },
  ];
  return (
    <Frame viewBox="0 0 600 130">
      <title>{t("help.ill.reg.title")}</title>
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
        {t("help.ill.reg.caption")}
      </text>
    </Frame>
  );
}

/** The four tabs of the personal cabinet. */
export function CabinetTabs({ t }: Props) {
  const tabs = [t("help.ill.cab.tab1"), t("help.ill.cab.tab2"), t("help.ill.cab.tab3"), t("help.ill.cab.tab4")];
  const rows = [
    t("help.ill.cab.row1"),
    t("help.ill.cab.row2"),
    t("help.ill.cab.row3"),
    t("help.ill.cab.row4"),
  ];
  return (
    <Frame viewBox="0 0 600 250">
      <title>{t("help.ill.cab.title")}</title>
      <rect x={20} y={20} width={560} height={210} rx={14} className={`${card} ${border}`} strokeWidth={1.5} />
      {tabs.map((tab, i) => {
        const x = 36 + i * 134;
        const active = i === 1;
        return (
          <g key={tab}>
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
              {tab}
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
        {t("help.ill.cab.caption")}
      </text>
    </Frame>
  );
}

/** Rating scale with the thresholds that unlock features. */
export function RatingScale({ t }: Props) {
  const marks = [
    { v: 1, x: 40 },
    { v: 3, x: 175 },
    { v: 5, x: 310 },
    { v: 7, x: 445 },
    { v: 10, x: 560 },
  ];
  return (
    <Frame viewBox="0 0 600 190">
      <title>{t("help.ill.rating.title")}</title>
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

      <text x={107} y={104} textAnchor="middle" className={`${label} text-[11px]`}>{t("help.ill.rating.none")}</text>
      <text x={242} y={104} textAnchor="middle" className={`${label} text-[11px]`}>{t("help.ill.rating.w3")}</text>
      <text x={377} y={104} textAnchor="middle" className={`${label} text-[11px]`}>{t("help.ill.rating.w10")}</text>
      <text x={502} y={104} textAnchor="middle" className={`${label} text-[11px]`}>{t("help.ill.rating.unlimited")}</text>

      <line x1={310} y1={124} x2={310} y2={140} className="stroke-green-600" strokeWidth={1.5} />
      <text x={318} y={144} className="fill-green-700 dark:fill-green-400 text-[12px] font-medium">
        {t("help.ill.rating.channel")}
      </text>
      <text x={40} y={172} className={`${label} text-[11px]`}>
        {t("help.ill.rating.start")}
      </text>
    </Frame>
  );
}

/** How money moves between reader and author. */
export function PaymentFlow({ t }: Props) {
  const steps = [
    { t: t("help.ill.pay.s1t"), d: t("help.ill.pay.s1d") },
    { t: t("help.ill.pay.s2t"), d: t("help.ill.pay.s2d") },
    { t: t("help.ill.pay.s3t"), d: t("help.ill.pay.s3d") },
    { t: t("help.ill.pay.s4t"), d: t("help.ill.pay.s4d") },
    { t: t("help.ill.pay.s5t"), d: t("help.ill.pay.s5d") },
  ];
  return (
    <Frame viewBox="0 0 600 170">
      <title>{t("help.ill.pay.title")}</title>
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
        {t("help.ill.pay.caption")}
      </text>
      <text x={300} y={150} textAnchor="middle" className="fill-green-700 dark:fill-green-400 text-[13px] font-semibold">
        {t("help.ill.pay.fee")}
      </text>
    </Frame>
  );
}

/** A channel card with two tariffs. */
export function ChannelCard({ t }: Props) {
  return (
    <Frame viewBox="0 0 600 235">
      <title>{t("help.ill.ch.title")}</title>
      <rect x={20} y={20} width={560} height={195} rx={14} className={`${card} ${border}`} strokeWidth={1.5} />
      <rect x={40} y={40} width={54} height={54} rx={12} className={muted} />
      <text x={67} y={73} textAnchor="middle" className={`${label} text-[10px]`}>{t("help.ill.ch.logo")}</text>

      <text x={110} y={58} className={`${strong} text-[15px] font-bold`}>{t("help.ill.ch.name")}</text>
      <text x={110} y={78} className={`${label} text-[11px]`}>{t("help.ill.ch.desc")}</text>
      <rect x={110} y={86} width={54} height={18} rx={9} className="fill-green-100 dark:fill-green-900/40" />
      <text x={137} y={99} textAnchor="middle" className="fill-green-700 dark:fill-green-400 text-[10px]">{t("help.ill.ch.tag1")}</text>
      <rect x={170} y={86} width={44} height={18} rx={9} className="fill-green-100 dark:fill-green-900/40" />
      <text x={192} y={99} textAnchor="middle" className="fill-green-700 dark:fill-green-400 text-[10px]">{t("help.ill.ch.tag2")}</text>

      <line x1={40} y1={120} x2={560} y2={120} className="stroke-gray-200 dark:stroke-gray-700" strokeWidth={1} />

      {[
        { n: t("help.ill.ch.month"), p: "1 500 ₽", d: t("help.ill.ch.d30"), x: 40 },
        { n: t("help.ill.ch.year"), p: "12 000 ₽", d: t("help.ill.ch.d365"), x: 310 },
      ].map((plan) => (
        <g key={plan.x}>
          <rect x={plan.x} y={135} width={250} height={62} rx={10} className={muted} />
          <text x={plan.x + 18} y={160} className={`${strong} text-[13px] font-semibold`}>{plan.n}</text>
          <text x={plan.x + 18} y={180} className={`${label} text-[11px]`}>{plan.d}</text>
          <text x={plan.x + 232} y={168} textAnchor="end" className="fill-green-700 dark:fill-green-400 text-[15px] font-bold">
            {plan.p}
          </text>
        </g>
      ))}
    </Frame>
  );
}

/** Free idea vs paid idea — what the reader sees. */
export function FreeVsPaid({ t }: Props) {
  return (
    <Frame viewBox="0 0 600 210">
      <title>{t("help.ill.fvp.title")}</title>
      {[
        { title: t("help.ill.fvp.free"), paid: false, x: 20 },
        { title: t("help.ill.fvp.paid"), paid: true, x: 310 },
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
                {t("help.ill.fvp.hidden")}
              </text>
              <text x={c.x + 135} y={141} textAnchor="middle" className={`${label} text-[10px]`}>
                {t("help.ill.fvp.afterPay")}
              </text>
              <rect x={c.x + 20} y={158} width={110} height={22} rx={11} className={accent} />
              <text x={c.x + 75} y={173} textAnchor="middle" className="fill-white text-[11px] font-medium">
                {t("help.ill.fvp.buy")}
              </text>
            </>
          ) : (
            <>
              <rect x={c.x + 20} y={106} width={230} height={7} rx={3.5} className={muted} />
              <rect x={c.x + 20} y={119} width={215} height={7} rx={3.5} className={muted} />
              <rect x={c.x + 20} y={132} width={190} height={7} rx={3.5} className={muted} />
              <rect x={c.x + 20} y={145} width={225} height={7} rx={3.5} className={muted} />
              <text x={c.x + 20} y={175} className="fill-green-700 dark:fill-green-400 text-[11px]">
                {t("help.ill.fvp.everyone")}
              </text>
            </>
          )}
        </g>
      ))}
    </Frame>
  );
}
