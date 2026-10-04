import type { SectionDict } from "./types";

// Configurable volume profile (indicator "vprofile_pro"): names, parameter labels, option labels, canvas texts. Rows are [key, ru, en, cn].
const rows: [string, string, string, string][] = [
  ["ind.vprofile_pro.name", "Профиль объёма (настраиваемый)", "Volume Profile (configurable)", "成交量分布 (可配置)"],
  [
    "ind.vprofile_pro.desc",
    "Рекомендуемый: диапазон (видимый / последние N баров / фиксированный / сессия / от точки), POC, VAH, VAL, High/Low профиля, таблица статистики, зоны спроса и предложения, пропуски, настроение, реальные сделки",
    "Recommended: range (visible / last N bars / fixed / session / from a point), POC, VAH, VAL, profile High/Low, statistics table, supply and demand zones, gaps, sentiment, real trades",
    "推荐: 范围 (可见 / 最近N根 / 固定 / 时段 / 自选点), POC、VAH、VAL、分布最高/最低价、统计表、供需区、缺口、情绪、真实成交",
  ],

  /* sections */
  ["ind.vp.g.range", "Диапазон", "Range", "范围"],
  ["ind.vp.g.profile", "Профиль", "Profile", "分布"],
  ["ind.vp.g.shape", "Гистограмма", "Histogram", "直方图"],
  ["ind.vp.g.levels", "Линии уровней", "Level lines", "水平线"],
  ["ind.vp.g.zones", "Настроение, зоны, пропуски", "Sentiment, zones, gaps", "情绪、区域、缺口"],
  ["ind.vp.g.table", "Таблица статистики", "Statistics table", "统计表"],
  ["ind.vp.g.rows", "Строки таблицы", "Table rows", "表格行"],
  ["ind.vp.g.colors", "Цвета", "Colours", "颜色"],

  /* range */
  ["ind.p.vpRange", "Диапазон профиля", "Profile range", "分布范围"],
  ["ind.p.vpLastN", "Длина (последние N баров)", "Length (last N bars)", "长度 (最近 N 根)"],
  ["ind.p.vpFromBack", "Фикс. диапазон: от (баров назад)", "Fixed range: from (bars back)", "固定范围: 起点 (向前根数)"],
  ["ind.p.vpToBack", "Фикс. диапазон: до (баров назад)", "Fixed range: to (bars back)", "固定范围: 终点 (向前根数)"],
  ["ind.p.vpFromIso", "Фикс. диапазон: от (время графика, ГГГГ-ММ-ДД чч:мм)", "Fixed range: from (chart time, YYYY-MM-DD hh:mm)", "固定范围: 起点 (图表时间 YYYY-MM-DD hh:mm)"],
  ["ind.p.vpToIso", "Фикс. диапазон: до (время графика; пусто = последний бар)", "Fixed range: to (chart time; empty = last bar)", "固定范围: 终点 (图表时间; 空 = 最后一根)"],
  ["ind.p.vpSession", "Сессия", "Session", "时段"],
  ["ind.p.vpAnchorTime", "Точка привязки", "Anchor", "锚点"],
  ["ind.p.vpHandles", "Края диапазона можно тянуть мышью", "Draggable range edges", "可拖动范围边缘"],
  ["ind.vp.o.visible", "Видимый диапазон", "Visible range", "可见范围"],
  ["ind.vp.o.lastN", "Последние N баров", "Last N bars", "最近 N 根"],
  ["ind.vp.o.fixed", "Фиксированный диапазон (от / до)", "Fixed range (from / to)", "固定范围 (起点 / 终点)"],
  ["ind.vp.o.session", "С начала сессии", "Since session start", "自时段开始"],
  ["ind.vp.o.anchor", "От точки на графике (клик)", "From a point on the chart (click)", "自图表上的点 (点击)"],

  /* profile */
  ["ind.p.vpRowMode", "Размер ряда задаётся", "Row size by", "行大小方式"],
  ["ind.p.vpRows", "Число рядов", "Number of rows", "行数"],
  ["ind.p.vpRowTicks", "Тиков в ряду", "Ticks per row", "每行跳数"],
  ["ind.p.vpRowPrice", "Высота ряда, цена", "Row height, price", "行高 (价格)"],
  ["ind.p.vpRowPct", "Высота ряда, % от цены", "Row height, % of price", "行高 (价格 %)"],
  ["ind.p.vpVaPct", "Зона стоимости, %", "Value area, %", "价值区域 %"],
  ["ind.p.vpSource", "Показывать объём", "Volume shown", "显示成交量"],
  ["ind.p.vpPolarity", "Полярность профиля (оценка по свечам)", "Profile polarity (candle estimate)", "分布极性 (K线估算)"],
  ["ind.p.vpUseFlow", "Реальные сделки, когда они есть", "Use real trades when available", "有逐笔数据时使用真实成交"],
  ["ind.p.vpSmooth", "Сглаживание (проходов)", "Smoothing (passes)", "平滑 (次数)"],
  ["ind.vp.o.rowPrice", "Высота ряда в цене", "Row height in price", "按价格行高"],
  ["ind.vp.o.rowPct", "Высота ряда в % от цены", "Row height in % of price", "按价格百分比行高"],
  ["ind.vp.o.srcAll", "Весь объём", "All volume", "全部成交量"],
  ["ind.vp.o.srcUpDown", "Рост / падение раздельно", "Up / down split", "涨/跌分色"],
  ["ind.vp.o.srcDelta", "Дельта (покупки − продажи)", "Delta (buys − sells)", "Delta (买 − 卖)"],
  ["ind.vp.o.polBar", "По бару (весь объём вверх или вниз)", "Bar polarity (whole bar up or down)", "按K线 (整根涨或跌)"],
  ["ind.vp.o.polPortion", "По доле бара (по положению закрытия)", "Bar portion (by where the close sits)", "按比例 (收盘位置)"],

  /* histogram */
  ["ind.p.vpShowHist", "Показывать гистограмму", "Show histogram", "显示直方图"],
  ["ind.p.vpPlacement", "Положение гистограммы", "Histogram placement", "直方图位置"],
  ["ind.p.vpWidthMode", "Ширина задаётся", "Width by", "宽度方式"],
  ["ind.p.vpWidthPct", "Ширина, % (экрана или диапазона)", "Width, % (of the screen or the range)", "宽度 % (屏幕或范围)"],
  ["ind.p.vpWidthPx", "Ширина, px", "Width, px", "宽度 (px)"],
  ["ind.p.vpOffset", "Отступ по горизонтали, px", "Horizontal offset, px", "水平偏移 (px)"],
  ["ind.p.vpMirror", "Зеркально (рост от другого края)", "Mirror (grow from the other edge)", "镜像 (从另一侧生长)"],
  ["ind.p.vpGradient", "Градиент", "Gradient", "渐变"],
  ["ind.p.vpWeighted", "Цвет по объёму (чем больше объём, тем насыщеннее)", "Volume-weighted colour (more volume = stronger)", "按成交量着色 (越大越浓)"],
  ["ind.p.vpAlphaVa", "Непрозрачность в зоне стоимости, %", "Opacity inside the value area, %", "价值区域内不透明度 %"],
  ["ind.p.vpAlphaOut", "Непрозрачность вне зоны стоимости, %", "Opacity outside the value area, %", "价值区域外不透明度 %"],
  ["ind.p.vpOutline", "Контур столбцов", "Bar outline", "柱轮廓"],
  ["ind.p.vpOutlineW", "Толщина контура", "Outline width", "轮廓宽度"],
  ["ind.p.vpPocBar", "Выделять ряд POC", "Highlight the POC row", "突出 POC 行"],
  ["ind.vp.o.wPct", "Процент ширины", "Percent of width", "宽度百分比"],
  ["ind.vp.o.wPx", "Пиксели", "Pixels", "像素"],
  ["ind.vp.o.plStart", "У начала диапазона", "At the range start", "范围起点处"],
  ["ind.vp.o.plEnd", "У конца диапазона", "At the range end", "范围终点处"],

  /* levels (generated below), shared */
  ["ind.p.vpPocMode", "Точка контроля (POC)", "Point of Control (POC)", "控制点 (POC)"],
  ["ind.p.vpDevVa", "Развивающиеся VAH / VAL", "Developing VAH / VAL", "发展中的 VAH / VAL"],
  ["ind.p.vpLevelLbls", "Подписи уровней с ценой", "Level labels with price", "水平线价格标签"],
  ["ind.p.vpLblSize", "Размер подписей", "Label size", "标签大小"],
  ["ind.vp.o.pocLast", "Последний (линия)", "Last (line)", "最终 (线)"],
  ["ind.vp.o.pocDev", "Развивающийся", "Developing", "发展中"],
  ["ind.vp.o.pocBoth", "Оба", "Both", "两者"],
  ["ind.vp.o.extRange", "До конца диапазона", "To the range end", "到范围终点"],
  ["ind.vp.o.szTiny", "Крошечный", "Tiny", "极小"],
  ["ind.vp.o.szSmall", "Малый", "Small", "小"],
  ["ind.vp.o.szNormal", "Обычный", "Normal", "中"],
  ["ind.vp.o.szLarge", "Крупный", "Large", "大"],

  /* sentiment, zones, gaps */
  ["ind.p.vpSent", "Профиль настроения (быки / медведи по ценам)", "Sentiment profile (bulls / bears per price)", "情绪分布 (各价位多/空)"],
  ["ind.p.vpSd", "Зоны спроса и предложения", "Supply & demand zones", "供需区"],
  ["ind.p.vpSdThr", "Порог зон, % (узлы не ниже 100 − X % от POC)", "Zone threshold, % (nodes within X % of the POC volume)", "区域阈值 % (距 POC 成交量不超过 X %)"],
  ["ind.p.vpGaps", "Пропуски профиля (узлы малого объёма)", "Volume profile gaps (low-volume nodes)", "分布缺口 (低量节点)"],
  ["ind.p.vpNodePct", "Определение узла, % от POC", "Node detection, % of the POC volume", "节点识别 % (相对 POC)"],
  ["ind.p.vpZoneAlpha", "Прозрачность зон, %", "Zone opacity, %", "区域不透明度 %"],

  /* table */
  ["ind.p.vpTable", "Таблица статистики профиля", "Profile statistics table", "分布统计表"],
  ["ind.p.vpTblPos", "Положение таблицы", "Table position", "表格位置"],
  ["ind.p.vpTblSize", "Размер текста таблицы", "Table text size", "表格文字大小"],
  ["ind.p.vpTblCompact", "Компактный вид", "Compact mode", "紧凑模式"],
  ["ind.p.vpTblAlpha", "Непрозрачность фона таблицы, %", "Table background opacity, %", "表格背景不透明度 %"],
  ["ind.p.vpTblAuto", "Цвета таблицы от темы графика", "Table colours from the chart theme", "表格颜色跟随图表主题"],
  ["ind.p.vpTblCollapsed", "Таблица свёрнута", "Table collapsed", "表格已折叠"],
  ["ind.vp.o.posTr", "Справа вверху", "Top right", "右上"],
  ["ind.vp.o.posTl", "Слева вверху", "Top left", "左上"],
  ["ind.vp.o.posBr", "Справа внизу", "Bottom right", "右下"],
  ["ind.vp.o.posBl", "Слева внизу", "Bottom left", "左下"],
  ["ind.p.vpRHigh", "Строка: High профиля", "Row: Profile High", "行: 分布最高价"],
  ["ind.p.vpRVah", "Строка: Value Area High", "Row: Value Area High", "行: 价值区域上沿"],
  ["ind.p.vpRPoc", "Строка: Point of Control", "Row: Point of Control", "行: 控制点"],
  ["ind.p.vpRVal", "Строка: Value Area Low", "Row: Value Area Low", "行: 价值区域下沿"],
  ["ind.p.vpRLow", "Строка: Low профиля", "Row: Profile Low", "行: 分布最低价"],
  ["ind.p.vpRTotal", "Строка: общий объём в диапазоне", "Row: total volume in range", "行: 范围内总成交量"],
  ["ind.p.vpRAvg", "Строка: средний объём на бар", "Row: average volume per bar", "行: 每根平均成交量"],
  ["ind.p.vpRMa", "Строка: MA объёма", "Row: volume MA", "行: 成交量均线"],
  ["ind.p.vpRBars", "Строка: число баров", "Row: number of bars", "行: K线数量"],
  ["ind.p.vpRFrom", "Строка: источник данных", "Row: data source", "行: 数据来源"],
  ["ind.p.vpRDelta", "Строка: дельта (реальные сделки)", "Row: delta (real trades)", "行: Delta (真实成交)"],
  ["ind.p.vpRBuy", "Строка: доля покупок % (реальные сделки)", "Row: buy % (real trades)", "行: 买入占比 % (真实成交)"],
  ["ind.p.vpMaLen", "Период MA объёма", "Volume MA length", "成交量均线周期"],

  /* colours */
  ["ind.p.vpColUp", "Объём роста", "Up volume", "上涨成交量"],
  ["ind.p.vpColDown", "Объём падения", "Down volume", "下跌成交量"],
  ["ind.p.vpColVaUp", "Рост в зоне стоимости", "Value area up", "价值区域上涨"],
  ["ind.p.vpColVaDown", "Падение в зоне стоимости", "Value area down", "价值区域下跌"],
  ["ind.p.vpColNeutral", "Нейтральный (весь объём)", "Neutral (all volume)", "中性 (全部成交量)"],
  ["ind.p.vpColOutline", "Контур", "Outline", "轮廓"],
  ["ind.p.vpColBull", "Быки", "Bullish", "看涨"],
  ["ind.p.vpColBear", "Медведи", "Bearish", "看跌"],
  ["ind.p.vpColSupply", "Зона предложения", "Supply zone", "供给区"],
  ["ind.p.vpColDemand", "Зона спроса", "Demand zone", "需求区"],
  ["ind.p.vpColGap", "Пропуски профиля", "Profile gaps", "分布缺口"],
  ["ind.p.vpTblBg", "Фон таблицы", "Table background", "表格背景"],
  ["ind.p.vpTblText", "Текст таблицы", "Table text", "表格文字"],
  ["ind.p.vpTblBorder", "Рамка таблицы", "Table border", "表格边框"],

  /* canvas texts */
  ["vp.s.high", "Макс", "High", "最高"],
  ["vp.s.low", "Мин", "Low", "最低"],
  ["vp.n.approx", "≈ оценка по свечам (нет тиковых данных)", "≈ candle-based estimate (no tick data)", "≈ 按K线估算 (无逐笔数据)"],
  ["vp.n.partial", "часть баров ≈ оценка", "some bars are estimated", "部分K线为估算"],
  ["vp.n.delayed", "≈ оценка: сделки MOEX приходят с задержкой ~15 мин", "≈ estimate: MOEX trades arrive ~15 min late", "≈ 估算: MOEX 成交延迟约15分钟"],
  ["vp.pick", "Кликните на графике, чтобы задать начало профиля объёма (Esc — отмена)", "Click the chart to set where the volume profile starts (Esc to cancel)", "点击图表设置成交量分布的起点 (Esc 取消)"],
  ["vp.drag", "Потяните край диапазона", "Drag the range edge", "拖动范围边缘"],
  ["vp.t.title", "Профиль объёма", "Volume Profile", "成交量分布"],
  ["vp.t.high", "Макс. профиля", "Profile High", "分布最高价"],
  ["vp.t.vah", "Верх зоны стоимости", "Value Area High", "价值区域上沿"],
  ["vp.t.poc", "Точка контроля", "Point of Control", "控制点"],
  ["vp.t.val", "Низ зоны стоимости", "Value Area Low", "价值区域下沿"],
  ["vp.t.low", "Мин. профиля", "Profile Low", "分布最低价"],
  ["vp.t.total", "Общий объём в диапазоне", "Total Volume in VP Range", "范围内总成交量"],
  ["vp.t.avg", "Ср. объём / бар", "Avg Volume/Bar", "每根平均成交量"],
  ["vp.t.ma", "MA объёма ({n})", "Volume MA ({n})", "成交量均线 ({n})"],
  ["vp.t.bars", "Число баров", "Number of Bars", "K线数量"],
  ["vp.t.from", "Данные", "Data From", "数据来源"],
  ["vp.t.delta", "Дельта", "Delta", "Delta"],
  ["vp.t.buy", "Покупки, %", "Buy %", "买入 %"],
  /* short labels of the phone-width table */
  ["vp.ts.total", "Объём", "Volume", "成交量"],
  ["vp.ts.avg", "Ср./бар", "Avg/bar", "均量/根"],
  ["vp.ts.bars", "Баров", "Bars", "K线数"],
  ["vp.ts.from", "Данные", "Data", "数据"],
  ["vp.ts.real", "сделки", "real", "成交"],
  ["vp.d.real", "реальные сделки {src}", "real trades {src}", "真实成交 {src}"],
  ["vp.d.approx", "≈ оценка по свечам", "≈ candle estimate", "≈ K线估算"],
  ["vp.d.mixed", "сделки {pct}% баров, остальное ≈", "trades in {pct}% of bars, rest ≈", "{pct}% K线为成交, 其余 ≈"],
  ["vp.d.bybit", "Bybit", "Bybit", "Bybit"],
  ["vp.d.moex", "МосБиржи", "MOEX", "莫斯科交易所"],
];

/* level lines: five levels with the same set of settings */
const LV: { k: string; ru: string; en: string; cn: string }[] = [
  { k: "High", ru: "Макс. профиля", en: "Profile High", cn: "分布最高价" },
  { k: "Vah", ru: "Верх зоны стоимости (VAH)", en: "Value Area High (VAH)", cn: "价值区域上沿 (VAH)" },
  { k: "Poc", ru: "Точка контроля (POC)", en: "Point of Control (POC)", cn: "控制点 (POC)" },
  { k: "Val", ru: "Низ зоны стоимости (VAL)", en: "Value Area Low (VAL)", cn: "价值区域下沿 (VAL)" },
  { k: "Low", ru: "Мин. профиля", en: "Profile Low", cn: "分布最低价" },
];
for (const L of LV) {
  rows.push(
    [`ind.p.vp${L.k}Show`, `${L.ru}: показать`, `${L.en}: show`, `${L.cn}: 显示`],
    [`ind.p.vp${L.k}W`, `${L.ru}: толщина`, `${L.en}: width`, `${L.cn}: 线宽`],
    [`ind.p.vp${L.k}Style`, `${L.ru}: стиль`, `${L.en}: style`, `${L.cn}: 线型`],
    [`ind.p.vp${L.k}Ext`, `${L.ru}: продление`, `${L.en}: extend`, `${L.cn}: 延伸`],
    [`ind.p.vp${L.k}Flag`, `${L.ru}: флажок на шкале цены`, `${L.en}: price scale flag`, `${L.cn}: 价格轴标签`],
    [`ind.p.vp${L.k}Lbl`, `${L.ru}: подпись «название цена»`, `${L.en}: text label`, `${L.cn}: 文字标签`],
    [`ind.p.vp${L.k}Col`, `${L.ru}`, `${L.en}`, `${L.cn}`],
  );
}

const dict: SectionDict = { ru: {}, en: {}, cn: {} };
for (const [key, ru, en, cn] of rows) {
  dict.ru[key] = ru;
  dict.en[key] = en;
  dict.cn[key] = cn;
}

export default dict;
