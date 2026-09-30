/* API reference of the script editor (Docs panel). Every text has ru / en / cn variants. */

export interface L {
  ru: string;
  en: string;
  cn: string;
}
export type DocBlock = { k: "p"; t: L } | { k: "code"; c: string } | { k: "api"; rows: [string, L][] };
export interface DocSection {
  id: string;
  title: L;
  blocks: DocBlock[];
}

const l = (ru: string, en: string, cn: string): L => ({ ru, en, cn });

export const DOC_SECTIONS: DocSection[] = [
  {
    id: "start",
    title: l("Быстрый старт", "Quick start", "快速开始"),
    blocks: [
      {
        k: "p",
        t: l(
          "Скрипт — это обычный JavaScript. Он выполняется один раз сразу над всеми барами графика: данные — массивы (Float64Array) длиной ctx.n, значение NaN означает «нет значения» (разрыв линии). Индикаторы из библиотеки ta принимают и возвращают такие массивы, поэтому циклы по барам обычно не нужны.",
          "A script is plain JavaScript. It runs once over all bars of the chart at the same time: data are arrays (Float64Array) of length ctx.n, NaN means “no value” (a gap in the line). The ta library takes and returns such arrays, so you rarely need a loop over bars.",
          "脚本就是普通的 JavaScript。它对图表上的所有K线一次性运行：数据是长度为 ctx.n 的数组（Float64Array），NaN 表示“无值”（线条断开）。ta 库的函数接收并返回这类数组，所以通常不需要逐根循环。",
        ),
      },
      {
        k: "code",
        c: `ctx.indicator({ name: 'My SMA', overlay: true });   // overlay: на графике цены; false — в отдельной панели
const len = ctx.input.int('Период', 20, { min: 1, max: 500 });
const src = ctx.input.source('Источник', 'close');
ctx.plot(ta.sma(src, len), { title: 'SMA', color: '#2962ff', linewidth: 2 });`,
      },
      {
        k: "p",
        t: l(
          "Параметры, объявленные через ctx.input, автоматически появляются во вкладке «Параметры» окна настроек индикатора, а цвета и типы линий — во вкладке «Стиль». Скрипт пересчитывается при смене параметров и при обновлении данных.",
          "Inputs declared with ctx.input show up automatically on the Inputs tab of the indicator settings, and plot colours and types on the Style tab. The script re-runs when the inputs or the data change.",
          "通过 ctx.input 声明的参数会自动出现在指标设置的“输入”页，线条颜色和类型出现在“样式”页。参数或数据变化时脚本会重新运行。",
        ),
      },
    ],
  },
  {
    id: "data",
    title: l("Данные графика", "Chart data", "图表数据"),
    blocks: [
      {
        k: "api",
        rows: [
          ["ctx.bars.time", l("Время открытия бара, мс (UTC)", "Bar open time, ms (UTC)", "K线开盘时间，毫秒 (UTC)")],
          ["ctx.bars.open / high / low / close / volume", l("Цены и объём (Float64Array)", "Prices and volume (Float64Array)", "价格与成交量 (Float64Array)")],
          ["ctx.bars.hl2 / hlc3 / ohlc4 / hlcc4", l("Производные цены", "Derived prices", "衍生价格")],
          ["ctx.bars.range / body", l("high − low и |close − open|", "high − low and |close − open|", "high − low 与 |close − open|")],
          ["ctx.bars.bullish / bearish", l("1, если close ≥ open (bullish) или close < open (bearish), иначе 0", "1 if close ≥ open (bullish) or close < open (bearish), else 0", "收盘≥开盘(bullish)或收盘<开盘(bearish)为 1，否则 0")],
          ["ctx.n", l("Число баров", "Number of bars", "K线数量")],
          ["ctx.dt.hour / minute / dow / day / month / year", l("Компоненты времени по UTC (dow: 0 = воскресенье); массивы", "UTC time components (dow: 0 = Sunday); arrays", "UTC 时间分量 (dow: 0 = 周日)；数组")],
          ["ctx.interval / ctx.precision", l("Длина бара в мс и число знаков цены", "Bar length in ms and price decimals", "K线周期（毫秒）与价格小数位")],
        ],
      },
    ],
  },
  {
    id: "inputs",
    title: l("Параметры (ctx.input)", "Inputs (ctx.input)", "输入参数 (ctx.input)"),
    blocks: [
      {
        k: "p",
        t: l(
          "Первый аргумент — подпись в настройках, второй — значение по умолчанию, третий — опции. Ключ параметра берётся из подписи (можно задать opts.key). Значения сохраняются вместе с раскладкой графика.",
          "The first argument is the label in the settings, the second the default value, the third the options. The parameter key derives from the label (or set opts.key). Values are saved with the chart layout.",
          "第一个参数是设置中显示的名称，第二个是默认值，第三个是选项。参数键由名称生成（也可设置 opts.key）。取值随图表布局一起保存。",
        ),
      },
      {
        k: "api",
        rows: [
          ["ctx.input.int(name, def, {min, max, step})", l("Целое число", "Integer", "整数")],
          ["ctx.input.float(name, def, {min, max, step})", l("Дробное число", "Decimal number", "小数")],
          ["ctx.input.bool(name, def)", l("Галочка (true / false)", "Checkbox (true / false)", "复选框 (true / false)")],
          ["ctx.input.string(name, def)", l("Текстовое поле", "Text field", "文本框")],
          ["ctx.input.select(name, def, ['a', 'b'])", l("Выпадающий список; опции — строки или {value, label}", "Dropdown; options are strings or {value, label}", "下拉列表；选项为字符串或 {value, label}")],
          ["ctx.input.color(name, '#2962ff')", l("Цвет (#rrggbb); редактируется на вкладке «Стиль»", "Colour (#rrggbb); edited on the Style tab", "颜色 (#rrggbb)；在“样式”页编辑")],
          ["ctx.input.source(name, 'close')", l("Источник данных: возвращает массив (close, open, high, low, hl2, hlc3, ohlc4, volume)", "Data source: returns an array (close, open, high, low, hl2, hlc3, ohlc4, volume)", "数据源：返回数组 (close, open, high, low, hl2, hlc3, ohlc4, volume)")],
        ],
      },
    ],
  },
  {
    id: "output",
    title: l("Вывод на график", "Output", "图表输出"),
    blocks: [
      {
        k: "api",
        rows: [
          ["ctx.indicator({name, overlay, format, minmax, paneRatio})", l("Название, overlay: true — рисовать на графике цены, format: 'price' | 'volume' | 'percent', minmax: [min, max] — фиксированная шкала панели", "Name; overlay: true draws on the price chart; format: 'price' | 'volume' | 'percent'; minmax: [min, max] fixes the pane scale", "名称；overlay: true 表示画在价格图上；format: 'price' | 'volume' | 'percent'；minmax: [min, max] 固定副图刻度")],
          ["ctx.plot(series, {title, color, linewidth, style, linestyle, offset, pricelabel, connect, display})", l("Линия. style: 'line' | 'histogram' | 'area' | 'columns' | 'circles' | 'step'; color — строка или массив цветов по барам; offset — сдвиг в барах (минус — влево); connect — соединять через NaN; display: 'none' — скрыть (для fill)", "A line. style: 'line' | 'histogram' | 'area' | 'columns' | 'circles' | 'step'; color is a string or a per-bar colour array; offset shifts bars (negative = left); connect joins across NaN; display: 'none' hides it (for fill)", "线条。style: 'line' | 'histogram' | 'area' | 'columns' | 'circles' | 'step'；color 为字符串或逐根颜色数组；offset 为平移根数（负数向左）；connect 跨 NaN 连线；display: 'none' 隐藏（用于 fill）")],
          ["ctx.hline(price, {title, color, linestyle, linewidth})", l("Горизонтальный уровень (значение можно менять на вкладке «Стиль»)", "Horizontal level (its value can be changed on the Style tab)", "水平线（数值可在“样式”页修改）")],
          ["ctx.fill(a, b, {color, colorUp, colorDown, title})", l("Заливка между двумя plot / hline. colorUp / colorDown — разные цвета, когда a выше / ниже b", "Fill between two plots / hlines. colorUp / colorDown give different colours where a is above / below b", "填充两条 plot / hline 之间的区域。colorUp / colorDown 分别用于 a 在 b 上方 / 下方")],
          ["ctx.bgcolor(colorOrArray)", l("Фон по барам (массив цветов или null). Используйте прозрачность: 'rgba(38,166,154,0.12)'", "Per-bar background (colour array or null). Use transparency: 'rgba(38,166,154,0.12)'", "逐根背景色（颜色数组或 null）。请使用透明度：'rgba(38,166,154,0.12)'")],
          ["ctx.barcolor(colorOrArray)", l("Перекрашивает свечи (только для overlay: true)", "Recolours candles (overlay: true only)", "重新给K线着色（仅 overlay: true）")],
          ["ctx.plotshape(cond, {location, shape, color, text, textcolor, size, price, offset})", l("Метки там, где cond ≠ 0. location: 'above' | 'below' | 'absolute' (нужен price или сам cond как цена); shape: triangleup, triangledown, circle, square, arrowup, arrowdown, label, flag, diamond, cross, xcross; size: tiny … huge. Не более 2000 меток", "Markers where cond ≠ 0. location: 'above' | 'below' | 'absolute' (needs price, or cond itself is the price); shape: triangleup, triangledown, circle, square, arrowup, arrowdown, label, flag, diamond, cross, xcross; size: tiny … huge. Up to 2000 markers", "在 cond ≠ 0 处画标记。location: 'above' | 'below' | 'absolute'（需要 price，或 cond 本身即价格）；shape: triangleup, triangledown, circle, square, arrowup, arrowdown, label, flag, diamond, cross, xcross；size: tiny … huge。最多 2000 个标记")],
          ["ctx.alertcondition(cond, message)", l("Условие оповещения. Пока только сохраняется и показывается в редакторе, уведомления не отправляются", "An alert condition. For now it is only stored and shown in the editor; no notification is sent", "提醒条件。目前仅保存并显示在编辑器中，不会发送通知")],
          ["ctx.log(...)", l("Вывод в консоль редактора (до 200 строк)", "Prints to the editor console (up to 200 lines)", "输出到编辑器控制台（最多 200 行）")],
        ],
      },
      {
        k: "p",
        t: l(
          "Лимиты: до 20 линий, до 5 млн значений суммарно, до 2000 меток, время выполнения 1,5 с. Скрипт, превысивший время, останавливается, а на легенде появляется значок ошибки.",
          "Limits: up to 20 plots, 5 million values in total, 2000 markers, 1.5 s of run time. A script that runs over the time is stopped and the legend shows an error badge.",
          "限制：最多 20 条线、总计 500 万个数值、2000 个标记、运行时间 1.5 秒。超时的脚本会被终止，图例上会显示错误标记。",
        ),
      },
    ],
  },
  {
    id: "ta-ma",
    title: l("ta: скользящие средние", "ta: moving averages", "ta：移动平均"),
    blocks: [
      {
        k: "api",
        rows: [
          ["ta.sma(src, len)", l("Простая", "Simple", "简单")],
          ["ta.ema(src, len)", l("Экспоненциальная", "Exponential", "指数")],
          ["ta.rma(src, len)", l("Сглаживание Уайлдера", "Wilder smoothing", "Wilder 平滑")],
          ["ta.wma(src, len)", l("Линейно-взвешенная", "Linearly weighted", "线性加权")],
          ["ta.hma(src, len)", l("Hull", "Hull", "Hull")],
          ["ta.dema(src, len) / ta.tema(src, len)", l("Двойная / тройная EMA", "Double / triple EMA", "双 / 三重 EMA")],
          ["ta.alma(src, len, offset, sigma)", l("Arnaud Legoux", "Arnaud Legoux", "Arnaud Legoux")],
          ["ta.vwma(src, len)", l("Взвешенная объёмом", "Volume-weighted", "成交量加权")],
          ["ta.linreg(src, len, offset)", l("Линейная регрессия (значение на конце линии)", "Linear regression (value at the end of the line)", "线性回归（线末端的值）")],
        ],
      },
    ],
  },
  {
    id: "ta-osc",
    title: l("ta: осцилляторы и волатильность", "ta: oscillators and volatility", "ta：震荡指标与波动率"),
    blocks: [
      {
        k: "api",
        rows: [
          ["ta.rsi(src, len)", l("RSI", "RSI", "RSI")],
          ["ta.macd(src, fast, slow, signal)", l("→ { macd, signal, hist }", "→ { macd, signal, hist }", "→ { macd, signal, hist }")],
          ["ta.stoch(kLen, kSmooth, dLen)", l("→ { k, d } по барам графика", "→ { k, d } on the chart bars", "→ { k, d }（基于图表K线）")],
          ["ta.cci(src, len) / ta.willr(len) / ta.mfi(len)", l("CCI, Williams %R, Money Flow Index", "CCI, Williams %R, Money Flow Index", "CCI、威廉 %R、资金流量指数")],
          ["ta.roc(src, len) / ta.mom(src, len) / ta.change(src, n)", l("Изменение в % / абсолютное", "Rate of change in % / absolute change", "变化率(%) / 绝对变化")],
          ["ta.atr(len) / ta.tr()", l("Средний истинный диапазон / истинный диапазон", "Average true range / true range", "平均真实波幅 / 真实波幅")],
          ["ta.stdev(src, len) / ta.variance(src, len)", l("Стандартное отклонение / дисперсия (по генеральной совокупности)", "Standard deviation / variance (population)", "标准差 / 方差（总体）")],
          ["ta.bbands(src, len, mult)", l("→ { basis, upper, lower }", "→ { basis, upper, lower }", "→ { basis, upper, lower }")],
          ["ta.keltner(len, mult, atrLen)", l("→ { basis, upper, lower }", "→ { basis, upper, lower }", "→ { basis, upper, lower }")],
          ["ta.donchian(len)", l("→ { upper, middle, lower }", "→ { upper, middle, lower }", "→ { upper, middle, lower }")],
          ["ta.highest(src, len) / ta.lowest(src, len) / ta.sum(src, len)", l("Скользящие максимум, минимум и сумма", "Rolling max, min and sum", "滚动最大值、最小值与求和")],
          ["ta.correlation(a, b, len)", l("Корреляция Пирсона", "Pearson correlation", "皮尔逊相关系数")],
        ],
      },
    ],
  },
  {
    id: "ta-trend",
    title: l("ta: тренд и объём", "ta: trend and volume", "ta：趋势与成交量"),
    blocks: [
      {
        k: "api",
        rows: [
          ["ta.supertrend(mult, len)", l("→ { value, direction (1 рост / −1 падение), up, down }", "→ { value, direction (1 up / −1 down), up, down }", "→ { value, direction (1 上涨 / −1 下跌), up, down }")],
          ["ta.adx(len, smooth)", l("→ { adx, plus, minus }", "→ { adx, plus, minus }", "→ { adx, plus, minus }")],
          ["ta.ichimoku(conv, base, spanB)", l("→ { tenkan, kijun, spanA, spanB, chikou }. Облако рисуйте с offset: +26, chikou — с offset: −26", "→ { tenkan, kijun, spanA, spanB, chikou }. Plot the cloud with offset: +26 and chikou with offset: −26", "→ { tenkan, kijun, spanA, spanB, chikou }。云图用 offset: +26 绘制，chikou 用 offset: −26")],
          ["ta.vwap(anchor, src)", l("VWAP; anchor: 'day' (по умолчанию) | 'week' | 'month' | 'year' | 'none'", "VWAP; anchor: 'day' (default) | 'week' | 'month' | 'year' | 'none'", "VWAP；anchor: 'day'（默认）| 'week' | 'month' | 'year' | 'none'")],
          ["ta.obv()", l("On-Balance Volume", "On-Balance Volume", "能量潮 OBV")],
          ["ta.pivothigh(src, left, right) / ta.pivotlow(src, left, right)", l("Пивоты; значение появляется на баре подтверждения (через right баров): для отрисовки на самом пивоте используйте offset: −right", "Pivots; the value appears on the confirmation bar (right bars later): plot with offset: −right to place it on the pivot itself", "枢轴点；数值出现在确认K线上（right 根之后）：用 offset: −right 画在枢轴本身")],
        ],
      },
    ],
  },
  {
    id: "ta-logic",
    title: l("ta: события и логика", "ta: events and logic", "ta：事件与逻辑"),
    blocks: [
      {
        k: "p",
        t: l(
          "Условия — это массивы 0 / 1 (NaN считается ложью). Любой аргумент можно заменить числом: ta.gt(rsi, 70).",
          "Conditions are 0 / 1 arrays (NaN counts as false). Any argument may be a plain number: ta.gt(rsi, 70).",
          "条件是 0 / 1 数组（NaN 视为假）。任何参数都可以直接写数字：ta.gt(rsi, 70)。",
        ),
      },
      {
        k: "api",
        rows: [
          ["ta.crossover(a, b) / ta.crossunder(a, b) / ta.cross(a, b)", l("Пересечение вверх / вниз / любое", "Cross up / down / either", "上穿 / 下穿 / 任意穿越")],
          ["ta.rising(src, n) / ta.falling(src, n)", l("Рост / падение n баров подряд", "Rising / falling for n bars in a row", "连续 n 根上升 / 下降")],
          ["ta.barssince(cond)", l("Баров с последнего срабатывания (0 на самом баре)", "Bars since the last true (0 on that bar)", "距上次成立的K线数（当根为 0）")],
          ["ta.valuewhen(cond, src, occurrence)", l("Значение src на баре, где cond был истинным (0 — последний раз)", "Value of src at the bar where cond was true (0 = most recent)", "cond 成立时 src 的值（0 = 最近一次）")],
          ["ta.gt / gte / lt / lte / eq / neq (a, b)", l("Сравнения", "Comparisons", "比较")],
          ["ta.and / or (a, b), ta.not(a)", l("Логика", "Logic", "逻辑")],
          ["ta.add / sub / mul / div / pow / max / min (a, b)", l("Арифметика по элементам", "Element-wise arithmetic", "逐元素运算")],
          ["ta.abs / sqrt / log / exp / floor / ceil / round / sign / neg (a)", l("Функции по элементам", "Element-wise functions", "逐元素函数")],
          ["ta.iff(cond, a, b)", l("a там, где cond истинно, иначе b", "a where cond is true, else b", "cond 成立取 a，否则取 b")],
          ["ta.nz(a, rep) / ta.na(a)", l("Заменить NaN значением / признак NaN", "Replace NaN with a value / NaN flag", "用数值替换 NaN / NaN 标记")],
          ["ta.shift(src, n) = ctx.prev(src, n)", l("Значение n баров назад (аналог close[n] в Pine)", "Value n bars ago (Pine's close[n])", "n 根之前的值（相当于 Pine 的 close[n]）")],
          ["ta.cum(src)", l("Накопленная сумма", "Cumulative sum", "累计和")],
        ],
      },
    ],
  },
  {
    id: "loops",
    title: l("Циклы и цвета", "Loops and colours", "循环与颜色"),
    blocks: [
      {
        k: "api",
        rows: [
          ["ctx.forEachBar(i => { … })", l("Цикл по барам 0 … n−1. Внутри индексируйте массивы: close[i], close[i - 1]", "Loop over bars 0 … n−1. Index arrays inside: close[i], close[i - 1]", "遍历K线 0 … n−1。在其中用索引访问数组：close[i], close[i - 1]")],
          ["ctx.series(i => value)", l("Строит массив из значения функции для каждого бара (null → NaN)", "Builds an array from a function evaluated for each bar (null → NaN)", "对每根K线求值并生成数组（null → NaN）")],
          ["ctx.nan() / ctx.nan(fill)", l("Массив длиной n, заполненный NaN (или числом)", "An n-length array filled with NaN (or a number)", "长度为 n、以 NaN（或数值）填充的数组")],
          ["ctx.color.rgba(color, alpha)", l("Цвет с прозрачностью", "A colour with transparency", "带透明度的颜色")],
          ["ctx.color.mix(c1, c2, t)", l("Смесь двух цветов (t от 0 до 1)", "Mix of two colours (t from 0 to 1)", "两种颜色混合 (t 为 0 到 1)")],
          ["ctx.color.cond(cond, a, b)", l("Массив цветов: a там, где cond истинно, иначе b (b может быть null или массивом)", "Colour array: a where cond is true, else b (b may be null or an array)", "颜色数组：cond 成立取 a，否则取 b（b 可为 null 或数组）")],
          ["ctx.color.gradient(src, lo, hi, cLo, cHi)", l("Цвет по значению от cLo (при lo) до cHi (при hi)", "Colour by value, from cLo (at lo) to cHi (at hi)", "按数值着色，从 cLo (lo 处) 到 cHi (hi 处)")],
          ["ctx.color.green / red / blue / orange / yellow / purple / aqua / gray …", l("Готовые цвета", "Ready-made colours", "预设颜色")],
        ],
      },
      {
        k: "code",
        c: `// Пример цикла: подсветить бары с длинной верхней тенью
const { open, high, low, close } = ctx.bars;
const colors = [];
ctx.forEachBar((i) => {
  const top = high[i] - Math.max(open[i], close[i]);
  colors.push(top > 2 * Math.abs(close[i] - open[i]) ? '#fbc02d' : null);
});
ctx.barcolor(colors);`,
      },
    ],
  },
  {
    id: "pine",
    title: l("Перенос идей из Pine Script", "Porting from Pine Script", "从 Pine Script 迁移"),
    blocks: [
      {
        k: "api",
        rows: [
          ["close[1]", l("ta.shift(close, 1) или close[i - 1] в цикле", "ta.shift(close, 1), or close[i - 1] in a loop", "ta.shift(close, 1)，循环中用 close[i - 1]")],
          ["ta.sma(close, 14)", l("ta.sma(ctx.bars.close, 14)", "ta.sma(ctx.bars.close, 14)", "ta.sma(ctx.bars.close, 14)")],
          ["input.int(14, 'Length')", l("ctx.input.int('Length', 14)", "ctx.input.int('Length', 14)", "ctx.input.int('Length', 14)")],
          ["cond ? a : b", l("ta.iff(cond, a, b)", "ta.iff(cond, a, b)", "ta.iff(cond, a, b)")],
          ["var x = 0; x := x + 1", l("let x = 0; внутри ctx.forEachBar(i => { x += 1; … })", "let x = 0; inside ctx.forEachBar(i => { x += 1; … })", "let x = 0；在 ctx.forEachBar(i => { x += 1; … }) 内使用")],
          ["plot(x, color = color.red)", l("ctx.plot(x, { color: ctx.color.red })", "ctx.plot(x, { color: ctx.color.red })", "ctx.plot(x, { color: ctx.color.red })")],
          ["plotshape(cond, style = shape.triangleup, location = location.belowbar)", l("ctx.plotshape(cond, { shape: 'triangleup', location: 'below' })", "ctx.plotshape(cond, { shape: 'triangleup', location: 'below' })", "ctx.plotshape(cond, { shape: 'triangleup', location: 'below' })")],
          ["ta.crossover(a, b)", l("ta.crossover(a, b) — то же", "ta.crossover(a, b) — the same", "ta.crossover(a, b) — 相同")],
        ],
      },
      {
        k: "p",
        t: l(
          "Отличия: не поддерживаются security() / request.* (данных других инструментов нет), стратегии и таблицы, а также сеть, хранилище и DOM — скрипт работает в изолированном потоке. Цепочки вида a[1] нужно записывать через ta.shift или цикл.",
          "Differences: security() / request.* (no other symbols), strategies and tables are not supported, and neither are the network, storage or the DOM — the script runs in an isolated worker. Expressions like a[1] must be written with ta.shift or a loop.",
          "差异：不支持 security() / request.*（没有其他品种的数据）、策略和表格，也没有网络、存储和 DOM——脚本在隔离线程中运行。a[1] 这类写法需要用 ta.shift 或循环来表达。",
        ),
      },
    ],
  },
];
