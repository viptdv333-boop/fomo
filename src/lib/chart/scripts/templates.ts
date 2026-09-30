/* Starter scripts of the template gallery. Names and short descriptions live in the i18n dictionary
   (isc.tpl.<id> / isc.tpl.<id>.d); the code comments are in Russian. Every template is exercised by the tests. */

export interface ScriptTemplate {
  id: string;
  /** Default script name (also the ctx.indicator name). */
  name: string;
  code: string;
}

export const BLANK_SCRIPT = `// Новый индикатор. Справка: кнопка «Справка» (Docs) справа вверху.
ctx.indicator({ name: 'Мой индикатор', overlay: false });

const len = ctx.input.int('Период', 14, { min: 1, max: 500 });
const src = ctx.input.source('Источник', 'close');
const color = ctx.input.color('Цвет', '#2962ff');

const value = ta.ema(src, len);
ctx.plot(value, { title: 'EMA', color, linewidth: 2 });
`;

export const SCRIPT_TEMPLATES: ScriptTemplate[] = [
  {
    id: "smacross",
    name: "SMA Cross",
    code: `// Пересечение двух скользящих средних + сигналы
ctx.indicator({ name: 'SMA Cross', overlay: true });

const fastLen = ctx.input.int('Быстрая', 9, { min: 1, max: 200 });
const slowLen = ctx.input.int('Медленная', 21, { min: 2, max: 500 });
const src = ctx.input.source('Источник', 'close');
const cFast = ctx.input.color('Цвет быстрой', '#2962ff');
const cSlow = ctx.input.color('Цвет медленной', '#ff9800');

const fast = ta.sma(src, fastLen);
const slow = ta.sma(src, slowLen);
const up = ta.crossover(fast, slow);
const down = ta.crossunder(fast, slow);

ctx.plot(fast, { title: 'Fast', color: cFast, linewidth: 2 });
ctx.plot(slow, { title: 'Slow', color: cSlow, linewidth: 2 });
ctx.plotshape(up, { location: 'below', shape: 'triangleup', color: '#26a69a', text: 'Buy' });
ctx.plotshape(down, { location: 'above', shape: 'triangledown', color: '#ef5350', text: 'Sell' });
ctx.alertcondition(up, 'Быстрая SMA пересекла медленную снизу вверх');
ctx.alertcondition(down, 'Быстрая SMA пересекла медленную сверху вниз');
`,
  },
  {
    id: "emaribbon",
    name: "EMA Ribbon",
    code: `// Лента из 8 EMA: цвет плавно меняется от быстрой к медленной
ctx.indicator({ name: 'EMA Ribbon', overlay: true });

const start = ctx.input.int('Первая длина', 10, { min: 2, max: 100 });
const step = ctx.input.int('Шаг', 5, { min: 1, max: 50 });
const src = ctx.input.source('Источник', 'close');
const c1 = ctx.input.color('Цвет быстрой', '#26a69a');
const c2 = ctx.input.color('Цвет медленной', '#ef5350');

for (let k = 0; k < 8; k++) {
  const len = start + k * step;
  ctx.plot(ta.ema(src, len), {
    title: 'EMA ' + len,
    color: ctx.color.mix(c1, c2, k / 7),
    linewidth: 1,
  });
}
`,
  },
  {
    id: "rsi",
    name: "RSI + сигналы",
    code: `// RSI с уровнями перекупленности / перепроданности и сигналами выхода из зон
ctx.indicator({ name: 'RSI+', overlay: false, minmax: [0, 100] });

const len = ctx.input.int('Период', 14, { min: 2, max: 200 });
const src = ctx.input.source('Источник', 'close');
const ob = ctx.input.float('Перекупленность', 70, { min: 50, max: 100, step: 1 });
const os = ctx.input.float('Перепроданность', 30, { min: 0, max: 50, step: 1 });
const color = ctx.input.color('Цвет', '#7e57c2');

const rsi = ta.rsi(src, len);
ctx.plot(rsi, { title: 'RSI', color, linewidth: 2 });
const hi = ctx.hline(ob, { title: 'Overbought', color: '#787b86' });
const lo = ctx.hline(os, { title: 'Oversold', color: '#787b86' });
ctx.hline(50, { title: 'Middle', color: 'rgba(120,123,134,0.5)', linestyle: 'dotted' });
ctx.fill(hi, lo, { color: 'rgba(126,87,194,0.08)' });

// выход из зоны перепроданности вверх = покупка, из перекупленности вниз = продажа
const buy = ta.crossover(rsi, os);
const sell = ta.crossunder(rsi, ob);
ctx.plotshape(buy, { location: 'absolute', price: rsi, shape: 'circle', color: '#26a69a', size: 'small' });
ctx.plotshape(sell, { location: 'absolute', price: rsi, shape: 'circle', color: '#ef5350', size: 'small' });
ctx.bgcolor(ctx.color.cond(ta.gt(rsi, ob), 'rgba(239,83,80,0.10)', ctx.color.cond(ta.lt(rsi, os), 'rgba(38,166,154,0.10)', null)));
ctx.alertcondition(buy, 'RSI вышел из зоны перепроданности');
ctx.alertcondition(sell, 'RSI вышел из зоны перекупленности');
`,
  },
  {
    id: "squeeze",
    name: "Bollinger Squeeze",
    code: `// Сжатие волатильности: полосы Боллинджера внутри канала Кельтнера
ctx.indicator({ name: 'BB Squeeze', overlay: true });

const len = ctx.input.int('Период', 20, { min: 5, max: 200 });
const bbMult = ctx.input.float('Множитель BB', 2, { min: 0.5, max: 5, step: 0.1 });
const kcMult = ctx.input.float('Множитель KC', 1.5, { min: 0.5, max: 5, step: 0.1 });
const color = ctx.input.color('Цвет', '#2962ff');

const bb = ta.bbands(ctx.bars.close, len, bbMult);
const kc = ta.keltner(len, kcMult, len);
const squeeze = ta.and(ta.lt(bb.upper, kc.upper), ta.gt(bb.lower, kc.lower));

const up = ctx.plot(bb.upper, { title: 'Upper', color, linewidth: 1 });
ctx.plot(bb.basis, { title: 'Basis', color: '#ff9800', linewidth: 1 });
const lo = ctx.plot(bb.lower, { title: 'Lower', color, linewidth: 1 });
ctx.fill(up, lo, { color: 'rgba(41,98,255,0.06)' });

ctx.bgcolor(ctx.color.cond(squeeze, 'rgba(251,192,45,0.16)', null));
// момент выхода из сжатия
const release = ta.and(ta.shift(squeeze, 1), ta.not(squeeze));
ctx.plotshape(release, { location: 'above', shape: 'diamond', color: '#fbc02d', text: 'Go' });
ctx.alertcondition(release, 'Сжатие волатильности закончилось');
`,
  },
  {
    id: "supertrend",
    name: "Supertrend",
    code: `// Supertrend: линия тренда, зелёная при росте и красная при падении
ctx.indicator({ name: 'Supertrend', overlay: true });

const mult = ctx.input.float('Множитель ATR', 3, { min: 0.5, max: 10, step: 0.1 });
const len = ctx.input.int('Период ATR', 10, { min: 1, max: 100 });
const cUp = ctx.input.color('Цвет роста', '#26a69a');
const cDown = ctx.input.color('Цвет падения', '#ef5350');

const st = ta.supertrend(mult, len);
ctx.plot(st.up, { title: 'Up', color: cUp, linewidth: 2 });
ctx.plot(st.down, { title: 'Down', color: cDown, linewidth: 2 });

const flipUp = ta.and(ta.eq(st.direction, 1), ta.eq(ta.shift(st.direction, 1), -1));
const flipDown = ta.and(ta.eq(st.direction, -1), ta.eq(ta.shift(st.direction, 1), 1));
ctx.plotshape(flipUp, { location: 'below', shape: 'triangleup', color: cUp, text: 'Buy' });
ctx.plotshape(flipDown, { location: 'above', shape: 'triangledown', color: cDown, text: 'Sell' });
ctx.alertcondition(flipUp, 'Supertrend: смена тренда вверх');
ctx.alertcondition(flipDown, 'Supertrend: смена тренда вниз');
`,
  },
  {
    id: "donchian",
    name: "Donchian Channel",
    code: `// Канал Дончиана: максимум и минимум за N баров
ctx.indicator({ name: 'Donchian', overlay: true });

const len = ctx.input.int('Период', 20, { min: 2, max: 500 });
const color = ctx.input.color('Цвет', '#2962ff');

const dc = ta.donchian(len);
const up = ctx.plot(dc.upper, { title: 'Upper', color, linewidth: 1 });
ctx.plot(dc.middle, { title: 'Middle', color: '#ff9800', linewidth: 1, linestyle: 'dashed' });
const lo = ctx.plot(dc.lower, { title: 'Lower', color, linewidth: 1 });
ctx.fill(up, lo, { color: 'rgba(41,98,255,0.06)' });

// пробой верхней границы предыдущего бара
const breakout = ta.gt(ctx.bars.close, ta.shift(dc.upper, 1));
ctx.plotshape(breakout, { location: 'below', shape: 'arrowup', color: '#26a69a' });
`,
  },
  {
    id: "macdhist",
    name: "MACD Histogram",
    code: `// MACD с четырёхцветной гистограммой
ctx.indicator({ name: 'MACD Colors', overlay: false });

const fast = ctx.input.int('Быстрая', 12, { min: 2, max: 100 });
const slow = ctx.input.int('Медленная', 26, { min: 3, max: 200 });
const sig = ctx.input.int('Сигнал', 9, { min: 1, max: 100 });
const src = ctx.input.source('Источник', 'close');

const m = ta.macd(src, fast, slow, sig);
const h = m.hist;
const prev = ta.shift(h, 1);

// растёт над нулём / падает над нулём / падает под нулём / растёт под нулём
const arr = [];
ctx.forEachBar((i) => {
  const v = h[i];
  const p = prev[i];
  if (!(v === v)) arr.push(null);
  else if (v >= 0) arr.push(v >= p ? '#26a69a' : '#b2dfdb');
  else arr.push(v <= p ? '#ef5350' : '#ffcdd2');
});

ctx.plot(h, { title: 'Histogram', style: 'columns', color: arr });
ctx.plot(m.macd, { title: 'MACD', color: '#2962ff', linewidth: 1 });
ctx.plot(m.signal, { title: 'Signal', color: '#ff9800', linewidth: 1 });
ctx.hline(0, { title: 'Zero' });
`,
  },
  {
    id: "vwap",
    name: "Session VWAP",
    code: `// VWAP с обнулением каждый день + полосы по стандартному отклонению
ctx.indicator({ name: 'Session VWAP', overlay: true });

const mult = ctx.input.float('Множитель полос', 1, { min: 0.1, max: 5, step: 0.1 });
const color = ctx.input.color('Цвет', '#e91e63');

const { high, low, close, volume, time } = ctx.bars;
const n = ctx.n;
const vwap = ctx.nan();
const upper = ctx.nan();
const lower = ctx.nan();

let day = -1, sv = 0, spv = 0, spv2 = 0;
ctx.forEachBar((i) => {
  const d = Math.floor(time[i] / 86400000);
  if (d !== day) { day = d; sv = 0; spv = 0; spv2 = 0; }
  const p = (high[i] + low[i] + close[i]) / 3;
  sv += volume[i]; spv += p * volume[i]; spv2 += p * p * volume[i];
  if (sv > 0) {
    const m = spv / sv;
    const sd = Math.sqrt(Math.max(0, spv2 / sv - m * m));
    vwap[i] = m; upper[i] = m + mult * sd; lower[i] = m - mult * sd;
  }
});

ctx.plot(vwap, { title: 'VWAP', color, linewidth: 2 });
const u = ctx.plot(upper, { title: 'Upper', color: 'rgba(233,30,99,0.6)', linewidth: 1 });
const l = ctx.plot(lower, { title: 'Lower', color: 'rgba(233,30,99,0.6)', linewidth: 1 });
ctx.fill(u, l, { color: 'rgba(233,30,99,0.05)' });
`,
  },
  {
    id: "volspike",
    name: "Volume Spikes",
    code: `// Маркеры всплесков объёма: объём больше среднего в K раз
ctx.indicator({ name: 'Volume Spikes', overlay: true });

const len = ctx.input.int('Период среднего', 20, { min: 2, max: 200 });
const k = ctx.input.float('Во сколько раз больше', 2.5, { min: 1, max: 20, step: 0.1 });

const avg = ta.sma(ctx.bars.volume, len);
const spike = ta.gt(ctx.bars.volume, ta.mul(avg, k));
const bull = ctx.bars.bullish;

ctx.plotshape(ta.and(spike, bull), { location: 'below', shape: 'circle', color: '#26a69a', size: 'small', text: 'V' });
ctx.plotshape(ta.and(spike, ta.not(bull)), { location: 'above', shape: 'circle', color: '#ef5350', size: 'small', text: 'V' });
ctx.alertcondition(spike, 'Всплеск объёма');
`,
  },
  {
    id: "insidebar",
    name: "Inside Bar",
    code: `// Внутренний бар: диапазон целиком внутри предыдущего бара
ctx.indicator({ name: 'Inside Bar', overlay: true });

const paint = ctx.input.bool('Красить свечу', true);

const { high, low } = ctx.bars;
const inside = ta.and(ta.lt(high, ta.shift(high, 1)), ta.gt(low, ta.shift(low, 1)));

ctx.plotshape(inside, { location: 'above', shape: 'square', color: '#fbc02d', size: 'tiny' });
if (paint) ctx.barcolor(ctx.color.cond(inside, '#fbc02d', null));
ctx.alertcondition(inside, 'Внутренний бар');
`,
  },
  {
    id: "zigzag",
    name: "ZigZag Lite",
    code: `// ZigZag по пивотам: соединяет подтверждённые вершины и впадины
ctx.indicator({ name: 'ZigZag Lite', overlay: true });

const left = ctx.input.int('Слева', 5, { min: 1, max: 50 });
const right = ctx.input.int('Справа', 5, { min: 1, max: 50 });
const color = ctx.input.color('Цвет', '#ff9800');

const ph = ta.pivothigh(ctx.bars.high, left, right);
const pl = ta.pivotlow(ctx.bars.low, left, right);
// пивот подтверждается через right баров: сдвигаем линию назад на right
const zz = ta.iff(ta.na(ph), pl, ph);

ctx.plot(zz, { title: 'ZigZag', color, linewidth: 2, offset: -right, connect: true });
ctx.plotshape(ta.iff(ta.na(ph), 0, 1), { location: 'absolute', price: ph, shape: 'circle', color: '#ef5350', size: 'tiny', offset: -right });
ctx.plotshape(ta.iff(ta.na(pl), 0, 1), { location: 'absolute', price: pl, shape: 'circle', color: '#26a69a', size: 'tiny', offset: -right });
`,
  },
];
