import type { SectionDict } from "./types";

// Order flow: footprint chart type, volume profile / VWAP / CVD / delta indicators. Rows are [key, ru, en, cn].
// Loaded after the older indicator dictionaries so the updated VWAP / volume profile texts win.
const rows: [string, string, string, string][] = [
  /* chart type + settings popover */
  ["chart.type.footprint", "Футпринт (кластерный график)", "Footprint", "足迹图 (Footprint)"],
  ["of.fp.title", "Футпринт", "Footprint", "足迹图"],
  ["of.fp.mode", "Режим ячеек", "Cell mode", "单元格模式"],
  ["of.fp.mode.bidask", "Bid × Ask", "Bid × Ask", "Bid × Ask"],
  ["of.fp.mode.delta", "Дельта", "Delta", "Delta"],
  ["of.fp.mode.volume", "Объём", "Volume", "成交量"],
  ["of.fp.mode.deltavol", "Дельта + объём (тепловая карта)", "Delta + volume (heatmap)", "Delta + 成交量 (热力图)"],
  ["of.fp.step", "Шаг цены", "Price step", "价格步长"],
  ["of.fp.step.auto", "Авто (по масштабу)", "Auto (from zoom)", "自动 (按缩放)"],
  ["of.fp.step.ticks", "тиков в ячейке", "ticks per cell", "每格跳数"],
  ["of.fp.poc", "Точка контроля (POC) бара", "Point of control (POC) per bar", "每根K线的控制点 (POC)"],
  ["of.fp.imb", "Дисбалансы", "Imbalances", "失衡"],
  ["of.fp.imbRatio", "Порог дисбаланса (×)", "Imbalance ratio (×)", "失衡比例 (×)"],
  ["of.fp.imbMin", "Мин. объём дисбаланса", "Min imbalance volume", "最小失衡成交量"],
  ["of.fp.diag", "Диагональные дисбалансы", "Diagonal imbalances", "对角线失衡"],
  ["of.fp.stacked", "Стек дисбалансов", "Stacked imbalances", "堆叠失衡"],
  ["of.fp.stackedN", "Уровней в стеке", "Levels in a stack", "堆叠层数"],
  ["of.fp.unfinished", "Незавершённый аукцион", "Unfinished auction", "未完成拍卖"],
  ["of.fp.totals", "Итоги бара: объём, Δ, Δ%, накопл. Δ", "Bar totals: volume, Δ, Δ%, cumulative Δ", "K线汇总: 成交量、Δ、Δ%、累计Δ"],
  ["of.fp.va", "Зона стоимости бара", "Bar value area", "K线价值区域"],
  ["of.fp.vaPct", "Зона стоимости, %", "Value area, %", "价值区域 %"],
  ["of.fp.body", "Свеча в центре бара", "Candle in the bar centre", "K线居中显示"],
  ["of.fp.colors", "Цвета", "Colours", "颜色"],
  ["of.fp.c.buy", "Покупки (Ask)", "Buys (Ask)", "买入 (Ask)"],
  ["of.fp.c.sell", "Продажи (Bid)", "Sells (Bid)", "卖出 (Bid)"],
  ["of.fp.c.poc", "POC / стек", "POC / unfinished", "POC / 未完成"],
  ["of.fp.c.imbBuy", "Дисбаланс покупок", "Buy imbalance", "买入失衡"],
  ["of.fp.c.imbSell", "Дисбаланс продаж", "Sell imbalance", "卖出失衡"],
  ["of.fp.c.stacked", "Стек дисбалансов", "Stacked imbalance", "堆叠失衡"],
  ["of.fp.c.va", "Зона стоимости / тепловая карта", "Value area / heatmap", "价值区域 / 热力图"],
  ["of.fp.c.text", "Текст (пусто = как тема)", "Text (empty = theme)", "文字 (空 = 主题色)"],
  ["of.fp.reset", "Сбросить настройки футпринта", "Reset footprint settings", "重置足迹图设置"],
  ["of.fp.zoomHint", "Приблизьте график: кластеры появляются, когда бары достаточно широкие", "Zoom in: clusters appear once the bars are wide enough", "请放大图表: K线足够宽时才显示簇"],
  ["of.src.bybit", "Данные: сделки Bybit (файлы за прошлые дни + поток в реальном времени)", "Data: Bybit trades (daily files for past days + live stream)", "数据: Bybit 成交 (历史日文件 + 实时流)"],
  ["of.src.moex", "Данные: сделки MOEX за текущую сессию (ISS, с направлением сделки). ISS отдаёт сделки с задержкой ~15 мин, свежие бары показаны как оценка ≈ (в реальном времени — при подключении Tinkoff API)", "Data: MOEX trades of the current session (ISS, with trade direction). ISS publishes trades ~15 min late, so the newest bars are shown as an estimate ≈ (real time when the Tinkoff API is connected)", "数据: MOEX 当前交易时段成交 (ISS, 含成交方向)。ISS 延迟约 15 分钟，最新K线显示为估算 ≈ (接入 Tinkoff API 后为实时)"],
  ["of.src.none", "Для этого источника нет тиковых данных: показана оценка по свечам (≈)", "No tick data for this source: showing a candle-based estimate (≈)", "此数据源无逐笔数据: 显示基于K线的估算 (≈)"],
  ["of.status.loading", "Загрузка тиковых данных…", "Loading tick data…", "正在加载逐笔数据…"],
  ["of.status.real", "Реальные сделки", "Real trades", "真实成交"],
  ["of.status.partial", "Часть баров — оценка (≈): нет тиков за этот период", "Some bars are estimates (≈): no ticks for that period", "部分K线为估算 (≈): 该时段无逐笔数据"],

  /* indicator names */
  ["ind.vwap.name", "VWAP (средневзвешенная по объёму)", "VWAP (Volume Weighted Average Price)", "成交量加权平均价 (VWAP)"],
  ["ind.vwap.desc", "Средняя цена с весом по объёму: сессия / неделя / месяц, полосы 1–3σ, по реальным сделкам, когда они есть", "Volume-weighted average price: session / week / month, 1–3σ bands, from real trades when available", "按成交量加权的均价: 日 / 周 / 月，1–3σ 通道，有逐笔数据时按真实成交计算"],
  ["ind.avwap.name", "Anchored VWAP (от точки)", "Anchored VWAP", "锚定 VWAP"],
  ["ind.avwap.desc", "VWAP от выбранного бара: кликните на графике, точку можно перетаскивать; добавляйте несколько", "VWAP from a chosen bar: click the chart to place it, drag to move; add as many as you need", "从选定K线开始的 VWAP: 点击图表放置，可拖动，可添加多个"],
  ["ind.vprofile.name", "Профиль объёма (видимый диапазон)", "Volume Profile (Visible Range)", "成交量分布 (可见范围)"],
  ["ind.vprofile.desc", "Объём по ценам видимой области: реальные сделки (покупки/продажи), POC, зона стоимости, развивающийся POC", "Volume by price over the visible range: real trades (buy / sell), POC, value area, developing POC", "可见范围内按价位分布的成交量: 真实成交 (买/卖)、POC、价值区域、发展中的 POC"],
  ["ind.vp_session.name", "Профиль объёма по сессиям", "Session Volume Profile", "分时段成交量分布"],
  ["ind.vp_session.desc", "Отдельный профиль объёма на каждый день / неделю / месяц, POC, неотработанные POC", "A volume profile for every day / week / month, POC lines and naked POCs", "每天 / 每周 / 每月一个成交量分布，含 POC 与未触及的 POC"],
  ["ind.cvd.name", "Накопленная дельта объёма (CVD)", "Cumulative Volume Delta (CVD)", "累计成交量差 (CVD)"],
  ["ind.cvd.desc", "Накопленная разница покупок и продаж рыночными ордерами: свечи или линия, сброс по сессии", "Running difference of market buys and sells: candles or a line, optional session reset", "市价买卖累计差: K线或折线，可按时段重置"],
  ["ind.delta.name", "Дельта объёма по барам", "Volume Delta per bar", "每根K线的成交量差"],
  ["ind.delta.desc", "Покупки минус продажи рыночными ордерами в каждом баре (бледные столбцы = оценка по свечам)", "Market buys minus sells in every bar (pale columns = candle-based estimate)", "每根K线内市价买入减卖出 (浅色柱 = K线估算)"],
  ["ind.bigtrades.name", "Крупные сделки (пузыри)", "Big trades (bubbles)", "大额成交 (气泡)"],
  ["ind.bigtrades.desc", "Самые крупные одиночные сделки: размер пузыря — объём, цвет — сторона агрессора (нужны тиковые данные)", "The largest single trades: bubble size is the volume, colour is the aggressor side (needs tick data)", "最大的单笔成交: 气泡大小为成交量，颜色为主动方 (需要逐笔数据)"],
  ["ind.p.top", "Показать крупнейших", "Show the largest", "显示最大的笔数"],
  ["ind.p.maxRadius", "Макс. радиус, px", "Max radius, px", "最大半径 px"],
  ["ind.p.colorBuy", "Цвет покупок", "Buy colour", "买入颜色"],
  ["ind.p.colorSell", "Цвет продаж", "Sell colour", "卖出颜色"],
  ["ind.volcolor.name", "Окраска свечей по объёму", "Volume-weighted candle colouring", "按成交量着色K线"],
  ["ind.volcolor.desc", "Чем больше объём относительно среднего, тем насыщеннее свеча", "The higher the volume against its average, the more saturated the candle", "成交量相对均值越大，K线颜色越浓"],

  /* parameters */
  ["ind.p.useTrades", "По сделкам (если есть)", "From trades (if available)", "使用逐笔成交 (若有)"],
  ["ind.p.hideHigher", "Скрывать, если бар ≥ периода", "Hide when the bar ≥ the period", "K线周期 ≥ 该周期时隐藏"],
  ["ind.p.bands2", "Полоса 2", "Band 2", "通道 2"],
  ["ind.p.mult2", "Множитель полосы 2", "Band 2 multiplier", "通道 2 倍数"],
  ["ind.p.bands3", "Полоса 3", "Band 3", "通道 3"],
  ["ind.p.mult3", "Множитель полосы 3", "Band 3 multiplier", "通道 3 倍数"],
  ["ind.p.rowMode", "Размер ряда", "Row size", "行大小"],
  ["ind.p.ticksPerRow", "Тиков в ряду", "Ticks per row", "每行跳数"],
  ["ind.p.showPoc", "Линия POC", "POC line", "显示 POC 线"],
  ["ind.p.split", "Покупки и продажи раздельно", "Split buys / sells", "买卖分色"],
  ["ind.p.useFlow", "Реальные сделки (если есть)", "Real trades (if available)", "使用真实成交 (若有)"],
  ["ind.p.extend", "Линии POC / VA", "POC / VA lines", "POC / VA 线"],
  ["ind.p.labels", "Подписи цен", "Price labels", "价格标签"],
  ["ind.p.developingPoc", "Развивающийся POC", "Developing POC", "发展中的 POC"],
  ["ind.p.session", "Сессия", "Session", "时段"],
  ["ind.p.extendPoc", "Продлить POC", "Extend POC", "延长 POC"],
  ["ind.p.nakedPocs", "Неотработанные POC", "Naked POCs", "未触及的 POC"],
  ["ind.p.mode", "Вид", "Display", "显示方式"],
  ["ind.p.reset", "Обнулять каждый", "Reset every", "重置周期"],
  ["ind.p.strength", "Сила окраски, %", "Colouring strength, %", "着色强度 %"],

  /* select options */
  ["ind.of.o.year", "Год", "Year", "年"],
  ["ind.of.o.rows", "Число рядов", "Number of rows", "行数"],
  ["ind.of.o.ticks", "Тиков в ряду", "Ticks per row", "每行跳数"],
  ["ind.of.o.extFull", "На всю ширину", "Full width", "全宽"],
  ["ind.of.o.extProfile", "Только по профилю", "Profile only", "仅分布范围"],
  ["ind.of.o.extNone", "Не продлевать", "Do not extend", "不延长"],
  ["ind.of.o.extSession", "До конца сессии", "To session end", "延长到时段结束"],
  ["ind.of.o.extRight", "До правого края", "To the right edge", "延长到右边缘"],
  ["ind.of.o.noReset", "Не обнулять", "Never", "不重置"],
  ["ind.of.o.candles", "Свечи", "Candles", "K线"],
  ["ind.of.o.line", "Линия", "Line", "折线"],

  /* anchored VWAP placement */
  ["of.avwap.pick", "Кликните на графике, чтобы поставить точку Anchored VWAP (Esc — отмена)", "Click the chart to place the Anchored VWAP anchor (Esc to cancel)", "点击图表放置 Anchored VWAP 锚点 (Esc 取消)"],
  ["of.avwap.drag", "Перетащите, чтобы сдвинуть точку VWAP", "Drag to move the VWAP anchor", "拖动以移动 VWAP 锚点"],
];

const dict: SectionDict = { ru: {}, en: {}, cn: {} };
for (const [key, ru, en, cn] of rows) {
  dict.ru[key] = ru;
  dict.en[key] = en;
  dict.cn[key] = cn;
}

export default dict;
