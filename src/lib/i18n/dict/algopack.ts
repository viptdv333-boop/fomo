import type { SectionDict } from "./types";

// MOEX ALGOPACK (Promo): order book panel, ALGOPACK panel, FUTOI / SuperCandles / Mega Alerts / HI2 indicators, the "delayed" badge.
// Rows are [key, ru, en, cn].
const rows: [string, string, string, string][] = [
  /* delayed badge on the chart */
  ["ap.delayed", "задержка 15 мин", "15 min delayed", "延迟15分钟"],
  ["ap.delayed.tip", "Свечи с публичного ISS Мосбиржи идут с задержкой около 15 минут", "Candles come from the public MOEX ISS feed, about 15 minutes delayed", "K线来自莫斯科交易所公开ISS，约延迟15分钟"],

  /* right panel tabs */
  ["shell.tab.orderbook", "Стакан", "Order book", "订单簿"],
  ["shell.tab.algo", "ALGOPACK: алерты и концентрация", "ALGOPACK: alerts & concentration", "ALGOPACK: 预警与集中度"],

  /* order book panel */
  ["ap.ob.bids", "Покупка", "Bids", "买盘"],
  ["ap.ob.asks", "Продажа", "Asks", "卖盘"],
  ["ap.ob.price", "Цена", "Price", "价格"],
  ["ap.ob.size", "Объём", "Size", "数量"],
  ["ap.ob.total", "Накоплено", "Total", "累计"],
  ["ap.ob.spread", "Спред", "Spread", "价差"],
  ["ap.ob.mid", "Середина", "Mid", "中间价"],
  ["ap.ob.imb", "Дисбаланс", "Imbalance", "失衡"],
  ["ap.ob.levels", "Уровней", "Levels", "档位"],
  ["ap.ob.live", "онлайн", "live", "实时"],
  ["ap.ob.updated", "обновлено", "updated", "更新于"],
  ["ap.ob.copied", "Цена скопирована", "Price copied", "价格已复制"],
  ["ap.ob.copyFail", "Не удалось скопировать", "Could not copy", "无法复制"],
  ["ap.ob.copy", "Нажмите на цену, чтобы скопировать", "Click a price to copy it", "点击价格即可复制"],
  ["ap.ob.loading", "Загрузка стакана…", "Loading the order book…", "正在加载订单簿…"],
  ["ap.ob.empty", "Стакан пуст (биржа закрыта?)", "The book is empty (market closed?)", "订单簿为空 (休市?)"],
  ["ap.ob.denied", "Стакан доступен только администраторам (подписка MOEX ALGOPACK Promo)", "The order book is available to admins only (MOEX ALGOPACK Promo subscription)", "订单簿仅对管理员开放 (MOEX ALGOPACK Promo 订阅)"],
  ["ap.ob.unsupported", "Для этого инструмента стакана нет", "No order book for this instrument", "该品种没有订单簿"],
  ["ap.ob.error", "Не удалось получить стакан", "Could not load the order book", "无法获取订单簿"],
  ["ap.ob.moexOnly", "Стакан есть только у инструментов Мосбиржи", "The order book is available for MOEX instruments only", "仅支持莫斯科交易所品种的订单簿"],

  /* ALGOPACK panel */
  ["ap.panel.alerts", "Mega Alerts", "Mega Alerts", "Mega Alerts"],
  ["ap.panel.alertsEmpty", "За последние дни алертов нет", "No alerts in the last days", "最近几天没有预警"],
  ["ap.panel.hi2", "Концентрация HI2", "HI2 concentration", "HI2 集中度"],
  ["ap.panel.hi2Empty", "Нет данных HI2", "No HI2 data", "没有 HI2 数据"],
  ["ap.panel.loading", "Загрузка…", "Loading…", "加载中…"],
  ["ap.panel.denied", "Данные ALGOPACK доступны только администраторам (подписка Promo)", "ALGOPACK data are available to admins only (Promo subscription)", "ALGOPACK 数据仅对管理员开放 (Promo 订阅)"],
  ["ap.panel.unsupported", "Для этого инструмента данных ALGOPACK нет", "No ALGOPACK data for this instrument", "该品种没有 ALGOPACK 数据"],
  ["ap.panel.moexOnly", "ALGOPACK есть только у инструментов Мосбиржи", "ALGOPACK covers MOEX instruments only", "ALGOPACK 仅覆盖莫斯科交易所品种"],
  ["ap.panel.error", "Не удалось загрузить данные", "Could not load the data", "无法加载数据"],
  ["ap.panel.ref", "Исторически после похожих алертов, изменение цены: через 5 мин {m5}%, 15 мин {m15}%, 1 час {h1}%", "Historically after similar alerts, price change: 5 min {m5}%, 15 min {m15}%, 1 h {h1}%", "历史上类似预警之后的价格变化: 5分钟 {m5}%, 15分钟 {m15}%, 1小时 {h1}%"],
  ["ap.panel.value", "значение", "value", "数值"],
  ["ap.panel.threshold", "порог", "threshold", "阈值"],
  ["ap.hi2.low", "низкая концентрация", "low concentration", "集中度低"],
  ["ap.hi2.moderate", "умеренная", "moderate", "中等"],
  ["ap.hi2.high", "высокая", "high", "集中度高"],
  ["ap.hi2.date", "На {date}", "As of {date}", "截至 {date}"],
  ["ap.lvl.low", "Низкая концентрация (1500)", "Low concentration (1500)", "集中度低 (1500)"],
  ["ap.lvl.high", "Высокая концентрация (2500)", "High concentration (2500)", "集中度高 (2500)"],

  /* notes painted into the panes of the indicators */
  ["ap.note.loading", "ALGOPACK: загрузка…", "ALGOPACK: loading…", "ALGOPACK: 加载中…"],
  ["ap.note.denied", "ALGOPACK: нет доступа (данные Promo — только администраторам)", "ALGOPACK: no access (Promo data are for admins only)", "ALGOPACK: 无权限 (Promo 数据仅限管理员)"],
  ["ap.note.none", "ALGOPACK: нет данных по инструменту за период", "ALGOPACK: no data for this instrument / period", "ALGOPACK: 该品种/时段没有数据"],
  ["ap.note.unsupported", "ALGOPACK: для этого инструмента недоступно", "ALGOPACK: not available for this instrument", "ALGOPACK: 该品种不可用"],
  ["ap.note.error", "ALGOPACK: не удалось загрузить данные", "ALGOPACK: could not load the data", "ALGOPACK: 无法加载数据"],
  ["ap.note.step5", "ALGOPACK: данные 5-минутные (на мелких барах повторяются)", "ALGOPACK: 5-minute data (repeated on finer bars)", "ALGOPACK: 5分钟数据 (更小周期重复显示)"],

  /* legend titles */
  ["ap.t.futoi", "Открытый интерес", "Open interest", "持仓量"],
  ["ap.t.aggr", "Агрессивный объём", "Aggressive volume", "主动成交量"],
  ["ap.t.trades", "Сделки", "Trades", "成交笔数"],
  ["ap.t.obimb", "Дисбаланс стакана %", "Book imbalance %", "订单簿失衡 %"],
  ["ap.t.spread", "Спред", "Spread", "价差"],
  ["ap.t.cancel", "Доля отмен %", "Cancel ratio %", "撤单比例 %"],
  ["ap.t.alerts", "Mega Alerts", "Mega Alerts", "Mega Alerts"],

  /* indicator names and descriptions */
  ["ind.ap_futoi.name", "Открытый интерес (FUTOI)", "Open interest (FUTOI)", "持仓量 (FUTOI)"],
  ["ind.ap_futoi.desc", "Позиции физических (FIZ) и юридических лиц (YUR) по фьючерсам: нетто, лонг/шорт, доля лонгов, число участников. Данные MOEX ALGOPACK Promo, 5-минутные срезы", "Positions of individuals (FIZ) and legal entities (YUR) in futures: net, long / short, long share, participant counts. MOEX ALGOPACK Promo data, 5-minute snapshots", "期货中个人 (FIZ) 与法人 (YUR) 的持仓: 净持仓、多空、多头占比、参与者数量。MOEX ALGOPACK Promo 数据，5分钟快照"],
  ["ind.ap_aggr.name", "Агрессивные покупки / продажи (SuperCandles)", "Aggressive buy / sell volume (SuperCandles)", "主动买入/卖出量 (SuperCandles)"],
  ["ind.ap_aggr.desc", "Объём рыночных покупок и продаж за 5 минут: раздельно, дельта или накопленная дельта за день. Данные MOEX ALGOPACK Promo (tradestats)", "Market buy and sell volume per 5 minutes: split, delta or cumulative delta per day. MOEX ALGOPACK Promo data (tradestats)", "每5分钟的市价买入/卖出量: 分开显示、差值或日内累计差值。MOEX ALGOPACK Promo 数据 (tradestats)"],
  ["ind.ap_trades.name", "Число и размер сделок (SuperCandles)", "Trade count and size (SuperCandles)", "成交笔数与单笔大小 (SuperCandles)"],
  ["ind.ap_trades.desc", "Количество сделок за бар или средний размер сделки (общий, покупки и продажи отдельно). Данные MOEX ALGOPACK Promo (tradestats)", "Number of trades per bar or the average trade size (overall, buys and sells apart). MOEX ALGOPACK Promo data (tradestats)", "每根K线的成交笔数或平均单笔大小 (整体、买入与卖出分开)。MOEX ALGOPACK Promo 数据 (tradestats)"],
  ["ind.ap_obimb.name", "Дисбаланс стакана (SuperCandles)", "Order book imbalance (SuperCandles)", "订单簿失衡 (SuperCandles)"],
  ["ind.ap_obimb.desc", "Перевес заявок на покупку над продажей в стакане, от −100 % до +100 %: лучший уровень или весь стакан, по объёму или стоимости. Данные MOEX ALGOPACK Promo (obstats)", "Bid-over-ask surplus in the order book, −100 % to +100 %: best level or the whole book, by volume or value. MOEX ALGOPACK Promo data (obstats)", "订单簿中买盘相对卖盘的多出部分，−100%到+100%: 最优档或整个订单簿，按数量或金额。MOEX ALGOPACK Promo 数据 (obstats)"],
  ["ind.ap_spread.name", "Спред стакана (SuperCandles)", "Order book spread (SuperCandles)", "订单簿价差 (SuperCandles)"],
  ["ind.ap_spread.desc", "Разница лучших цен покупки и продажи (и на глубине стакана). Данные MOEX ALGOPACK Promo (obstats)", "Gap between the best bid and ask (and deeper in the book). MOEX ALGOPACK Promo data (obstats)", "最优买卖价之差 (以及更深档位)。MOEX ALGOPACK Promo 数据 (obstats)"],
  ["ind.ap_cancel.name", "Доля отмен заявок (SuperCandles)", "Order cancellation ratio (SuperCandles)", "撤单比例 (SuperCandles)"],
  ["ind.ap_cancel.desc", "Отменённые заявки к выставленным за 5 минут: по объёму, числу или стоимости; можно отдельно по покупкам и продажам. Данные MOEX ALGOPACK Promo (orderstats)", "Cancelled to placed orders per 5 minutes: by volume, count or value; buys and sells can be split. MOEX ALGOPACK Promo data (orderstats)", "每5分钟撤单与挂单之比: 按数量、笔数或金额; 可区分买卖。MOEX ALGOPACK Promo 数据 (orderstats)"],
  ["ind.ap_alerts.name", "Mega Alerts (аномалии)", "Mega Alerts (anomalies)", "Mega Alerts (异常)"],
  ["ind.ap_alerts.desc", "Маркеры аномалий объёма, чистого объёма и цены прямо на графике: ▲ покупатели / рост, ▼ продавцы / падение, ◆ нейтрально. Данные MOEX ALGOPACK Promo", "Markers of abnormal volume, net volume and price moves on the chart: ▲ buyers / rise, ▼ sellers / fall, ◆ neutral. MOEX ALGOPACK Promo data", "图上标出成交量、净成交量和价格的异常: ▲ 买方/上涨, ▼ 卖方/下跌, ◆ 中性。MOEX ALGOPACK Promo 数据"],
  ["ind.ap_hi2.name", "Концентрация рынка (HI2)", "Market concentration (HI2)", "市场集中度 (HI2)"],
  ["ind.ap_hi2.desc", "Индекс Херфиндаля-Хиршмана по участникам торгов, ежедневно: до 1500 низкая, 1500–2500 умеренная, выше 2500 высокая концентрация. Данные MOEX ALGOPACK Promo", "Herfindahl-Hirschman index of the market participants, daily: below 1500 low, 1500–2500 moderate, above 2500 high concentration. MOEX ALGOPACK Promo data", "市场参与者的赫芬达尔-赫希曼指数 (每日): 低于1500为低, 1500–2500为中等, 高于2500为高集中度。MOEX ALGOPACK Promo 数据"],

  /* parameters */
  ["ind.p.apMetric", "Показатель", "Metric", "指标"],
  ["ind.p.apMode", "Режим", "Mode", "模式"],
  ["ind.p.apFiz", "Физические лица (FIZ)", "Individuals (FIZ)", "个人 (FIZ)"],
  ["ind.p.apYur", "Юридические лица (YUR)", "Legal entities (YUR)", "法人 (YUR)"],
  ["ind.p.apColorFiz", "Цвет FIZ", "FIZ colour", "FIZ 颜色"],
  ["ind.p.apColorYur", "Цвет YUR", "YUR colour", "YUR 颜色"],
  ["ind.p.apSmooth", "Сглаживание (баров)", "Smoothing (bars)", "平滑 (根)"],
  ["ind.p.apColor", "Цвет", "Colour", "颜色"],
  ["ind.p.apSides", "Отдельно покупки и продажи", "Buys and sells apart", "区分买卖"],
  ["ind.p.apKinds", "Типы алертов", "Alert kinds", "预警类型"],
  ["ind.p.apLabels", "Подписи на маркерах", "Marker labels", "标记标签"],
  ["ind.p.apColorNeutral", "Цвет нейтральных", "Neutral colour", "中性颜色"],

  /* select options */
  ["ind.ap.o.net", "Нетто-позиция", "Net position", "净持仓"],
  ["ind.ap.o.gross", "Лонг и шорт", "Long and short", "多头与空头"],
  ["ind.ap.o.share", "Доля лонгов, %", "Long share, %", "多头占比 %"],
  ["ind.ap.o.people", "Число участников", "Participants", "参与者数量"],
  ["ind.ap.o.split", "Покупки вверх / продажи вниз", "Buys up / sells down", "买入向上 / 卖出向下"],
  ["ind.ap.o.delta", "Дельта", "Delta", "差值"],
  ["ind.ap.o.cum", "Накопленная дельта (за день)", "Cumulative delta (per day)", "累计差值 (按日)"],
  ["ind.ap.o.count", "Число сделок", "Trade count", "成交笔数"],
  ["ind.ap.o.avg", "Средний размер сделки", "Average trade size", "平均单笔大小"],
  ["ind.ap.o.avgSides", "Средний размер: покупки и продажи", "Average size: buys and sells", "平均大小: 买入与卖出"],
  ["ind.ap.o.bboVol", "Лучший уровень, по объёму", "Best level, by volume", "最优档, 按数量"],
  ["ind.ap.o.bboVal", "Лучший уровень, по стоимости", "Best level, by value", "最优档, 按金额"],
  ["ind.ap.o.fullVol", "Весь стакан, по объёму", "Whole book, by volume", "整个订单簿, 按数量"],
  ["ind.ap.o.fullVal", "Весь стакан, по стоимости", "Whole book, by value", "整个订单簿, 按金额"],
  ["ind.ap.o.bbo", "Лучшие цены", "Best bid / ask", "最优买卖价"],
  ["ind.ap.o.deep", "10 уровней", "10 levels", "10档"],
  ["ind.ap.o.big", "На крупный объём (1 млн ₽)", "For a large size (1M RUB)", "大额 (100万卢布)"],
  ["ind.ap.o.vol", "По объёму", "By volume", "按数量"],
  ["ind.ap.o.orders", "По числу заявок", "By order count", "按笔数"],
  ["ind.ap.o.val", "По стоимости", "By value", "按金额"],
  ["ind.ap.o.all", "Все", "All", "全部"],
  ["ind.ap.o.volume", "Объём", "Volume", "成交量"],
  ["ind.ap.o.netvol", "Чистый объём", "Net volume", "净成交量"],
  ["ind.ap.o.price", "Изменение цены", "Price change", "价格变化"],
  ["ind.ap.o.levels", "Новые максимумы / минимумы", "New highs / lows", "新高/新低"],

  /* alert types */
  ["ap.al.vol_s_99_9_pctl", "Объём продаж выше 99,9 перцентиля", "Sell volume above the 99.9th percentile", "卖出量超过99.9百分位"],
  ["ap.al.vol_b_99_9_pctl", "Объём покупок выше 99,9 перцентиля", "Buy volume above the 99.9th percentile", "买入量超过99.9百分位"],
  ["ap.al.vol_99_9_pctl", "Общий объём выше 99,9 перцентиля", "Total volume above the 99.9th percentile", "总成交量超过99.9百分位"],
  ["ap.al.vol_s_max", "Максимум объёма продаж за период", "Sell volume at a recent high", "卖出量创近期新高"],
  ["ap.al.vol_b_max", "Максимум объёма покупок за период", "Buy volume at a recent high", "买入量创近期新高"],
  ["ap.al.vol_max", "Максимум общего объёма за период", "Total volume at a recent high", "总成交量创近期新高"],
  ["ap.al.net_vol_99_9_pctl-", "Чистый объём (продажи) выше 99,9 перцентиля", "Net selling above the 99.9th percentile", "净卖出超过99.9百分位"],
  ["ap.al.net_vol_99_9_pctl+", "Чистый объём (покупки) выше 99,9 перцентиля", "Net buying above the 99.9th percentile", "净买入超过99.9百分位"],
  ["ap.al.net_vol_min", "Минимум чистого объёма за период", "Net volume at a recent low", "净成交量创近期新低"],
  ["ap.al.net_vol_max", "Максимум чистого объёма за период", "Net volume at a recent high", "净成交量创近期新高"],
  ["ap.al.pr_change_99_9_pctl-", "Резкое падение цены (99,9 перцентиль)", "Sharp price drop (99.9th percentile)", "价格急跌 (99.9百分位)"],
  ["ap.al.pr_change_99_9_pctl+", "Резкий рост цены (99,9 перцентиль)", "Sharp price rise (99.9th percentile)", "价格急涨 (99.9百分位)"],
  ["ap.al.pr_change_min", "Рекордное падение цены за период", "Price drop at a recent record", "价格跌幅创近期纪录"],
  ["ap.al.pr_change_max", "Рекордный рост цены за период", "Price rise at a recent record", "价格涨幅创近期纪录"],
  ["ap.al.pr_high_max", "Новый максимум цены", "New price high", "价格创新高"],
  ["ap.al.pr_low_min", "Новый минимум цены", "New price low", "价格创新低"],
];

const dict: SectionDict = { ru: {}, en: {}, cn: {} };
for (const [key, ru, en, cn] of rows) {
  dict.ru[key] = ru;
  dict.en[key] = en;
  dict.cn[key] = cn;
}

export default dict;
