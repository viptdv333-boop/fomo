import type { SectionDict } from "./types";

// Imbalance / liquidity indicators (analysis/zones.ts, indicators/liquidity-defs.ts): catalog category, names, descriptions,
// parameter labels, select options and the strings painted on the chart. Rows are [key, ru, en, cn]; ru is the source language.
const rows: [string, string, string, string][] = [
  ["ind.cat.liquidity", "Имбалансы / Ликвидность", "Imbalances / Liquidity", "失衡 / 流动性"],

  /* section headings of the settings dialog */
  ["ind.zn.g.detect", "Поиск", "Detection", "识别"],
  ["ind.zn.g.show", "Отображение", "Display", "显示"],

  /* shared select options */
  ["ind.zn.o.atr", "× ATR", "× ATR", "× ATR"],
  ["ind.zn.o.pct", "% от цены", "% of price", "价格 %"],
  ["ind.zn.o.touch", "Касание зоны", "Touch of the zone", "触及区域"],
  ["ind.zn.o.wick", "Тень пробила дальнюю границу", "Wick through the far edge", "影线穿过远端边界"],
  ["ind.zn.o.close", "Закрытие за дальней границей", "Close beyond the far edge", "收盘越过远端边界"],
  ["ind.zn.o.swWick", "Тень выше/ниже уровня", "Wick beyond the level", "影线越过水平"],
  ["ind.zn.o.swClose", "Закрытие за уровнем", "Close beyond the level", "收盘越过水平"],

  /* FVG */
  ["ind.fvg.name", "Имбалансы (FVG)", "Imbalances (FVG)", "失衡区 (FVG)"],
  [
    "ind.fvg.desc",
    "Fair Value Gap: трёхсвечные разрывы (имбалансы) от средней свечи вправо до закрытия цены; митигация, частичное заполнение, гэпы и объёмные имбалансы",
    "Fair Value Gaps: three-candle imbalances drawn from the middle candle to the right until price fills them; mitigation, partial fill, opening gaps and volume imbalances",
    "公允价值缺口：由三根K线形成的失衡区，从中间K线向右延伸直到被价格回补；支持回补规则、部分回补、跳空缺口与成交量失衡",
  ],
  ["ind.p.fvMinSize", "Мин. размер разрыва", "Min. gap size", "最小缺口大小"],
  ["ind.p.fvUnit", "Единица размера", "Size unit", "大小单位"],
  ["ind.p.fvAtrLen", "Период ATR", "ATR length", "ATR 周期"],
  ["ind.p.fvMitigation", "Когда зона отработана", "Zone is mitigated when", "何时视为已回补"],
  ["ind.p.fvShrink", "Уменьшать зону при частичном заполнении", "Shrink the zone on partial fill", "部分回补时缩小区域"],
  ["ind.p.fvGaps", "Гэпы открытия (low > high предыдущей)", "Opening gaps (low > previous high)", "跳空缺口 (低点 > 前高)"],
  ["ind.p.fvVi", "Объёмные имбалансы (разрыв между телами)", "Volume imbalances (gap between bodies)", "成交量失衡 (实体间缺口)"],
  ["ind.p.fvLookback", "Анализировать последних баров", "Analyse last N bars", "分析最近 N 根K线"],
  ["ind.p.fvMax", "Макс. зон", "Max zones", "最大区域数"],
  ["ind.p.fvShowMit", "Показывать отработанные", "Show mitigated zones", "显示已回补区域"],
  ["ind.p.fvExtend", "Продлевать вправо", "Extend to the right", "向右延伸"],
  ["ind.p.fvLen", "Длина зоны без продления, баров", "Zone length when not extended, bars", "不延伸时的区域长度 (K线数)"],
  ["ind.p.fvMid", "Линия 50 % зоны", "50 % line", "50% 中线"],
  ["ind.p.fvLabel", "Подписи зон", "Zone labels", "区域标签"],
  ["ind.p.fvBorder", "Рамка зоны", "Zone border", "区域边框"],
  ["ind.p.fvOpacity", "Прозрачность заливки, %", "Fill opacity, %", "填充不透明度 %"],
  ["ind.p.fvColBull", "Бычий имбаланс", "Bullish imbalance", "看涨失衡"],
  ["ind.p.fvColBear", "Медвежий имбаланс", "Bearish imbalance", "看跌失衡"],

  /* order blocks */
  ["ind.order_blocks.name", "Ордер-блоки (OB)", "Order blocks (OB)", "订单块 (OB)"],
  [
    "ind.order_blocks.desc",
    "Последняя противоположная свеча перед импульсом: зона спроса/предложения вправо до митигации",
    "The last opposite candle before an impulse: a demand / supply zone extended to the right until mitigated",
    "冲击行情前最后一根反向K线：需求/供给区，向右延伸直到被回补",
  ],
  ["ind.p.obImpulse", "Сила импульса, × ATR", "Impulse size, × ATR", "冲击幅度 × ATR"],
  ["ind.p.obAtrLen", "Период ATR", "ATR length", "ATR 周期"],
  ["ind.p.obWithin", "Импульс не позже чем через, баров", "Impulse within, bars", "冲击出现在 N 根K线内"],
  ["ind.p.obMitigation", "Когда блок отработан", "Block is mitigated when", "何时视为已回补"],
  ["ind.p.obLookback", "Анализировать последних баров", "Analyse last N bars", "分析最近 N 根K线"],
  ["ind.p.obMax", "Макс. блоков", "Max blocks", "最大区块数"],
  ["ind.p.obShowMit", "Показывать отработанные", "Show mitigated blocks", "显示已回补区块"],
  ["ind.p.obExtend", "Продлевать вправо", "Extend to the right", "向右延伸"],
  ["ind.p.obLen", "Длина без продления, баров", "Length when not extended, bars", "不延伸时的长度 (K线数)"],
  ["ind.p.obLabel", "Подписи блоков", "Block labels", "区块标签"],
  ["ind.p.obBorder", "Рамка блока", "Block border", "区块边框"],
  ["ind.p.obOpacity", "Прозрачность заливки, %", "Fill opacity, %", "填充不透明度 %"],
  ["ind.p.obColBull", "Бычий блок (спрос)", "Bullish block (demand)", "看涨区块 (需求)"],
  ["ind.p.obColBear", "Медвежий блок (предложение)", "Bearish block (supply)", "看跌区块 (供给)"],

  /* liquidity pools */
  ["ind.liq_pools.name", "Ликвидность: равные максимумы/минимумы (BSL/SSL)", "Liquidity pools (equal highs / lows)", "流动性池 (等高 / 等低)"],
  [
    "ind.liq_pools.desc",
    "Скопления стопов над равными максимумами (BSL) и под равными минимумами (SSL): уровень живёт до снятия ликвидности, снятые помечаются крестом",
    "Stops resting above equal highs (BSL) and below equal lows (SSL): a level lives until it is swept, swept levels get a cross",
    "等高点上方 (BSL) 与等低点下方 (SSL) 的止损聚集区：水平线持续到被扫除，被扫除的用叉号标记",
  ],
  ["ind.p.lqPivot", "Сила свинга (баров слева/справа)", "Swing strength (bars each side)", "摆动强度 (左右K线数)"],
  ["ind.p.lqTol", "Допуск равенства уровней", "Equality tolerance", "等价容差"],
  ["ind.p.lqUnit", "Единица допуска", "Tolerance unit", "容差单位"],
  ["ind.p.lqAtrLen", "Период ATR", "ATR length", "ATR 周期"],
  ["ind.p.lqMinTouch", "Мин. свингов в скоплении", "Min. swings in a pool", "区域内最少摆动点数"],
  ["ind.p.lqSweep", "Что считать снятием ликвидности", "A level is swept by", "何种情形视为被扫除"],
  ["ind.p.lqLookback", "Анализировать последних баров", "Analyse last N bars", "分析最近 N 根K线"],
  ["ind.p.lqMax", "Макс. уровней с каждой стороны", "Max levels per side", "每侧最大水平数"],
  ["ind.p.lqShowSwept", "Показывать снятые", "Show swept levels", "显示已扫除水平"],
  ["ind.p.lqExtend", "Продлевать вправо до снятия", "Extend to the right until swept", "向右延伸直到被扫除"],
  ["ind.p.lqLen", "Длина без продления, баров", "Length when not extended, bars", "不延伸时的长度 (K线数)"],
  ["ind.p.lqBand", "Полоса скопления", "Cluster band", "聚集区带"],
  ["ind.p.lqPoints", "Точки свингов", "Swing dots", "摆动点标记"],
  ["ind.p.lqLabel", "Подписи BSL / SSL", "BSL / SSL labels", "BSL / SSL 标签"],
  ["ind.p.lqAxis", "Метки ближайших уровней на шкале цены", "Price-scale tags for the nearest levels", "价格轴标签 (最近水平)"],
  ["ind.p.lqOpacity", "Прозрачность полосы, %", "Band opacity, %", "区带不透明度 %"],
  ["ind.p.lqColBsl", "BSL (ликвидность над максимумами)", "BSL (above highs)", "BSL (高点上方)"],
  ["ind.p.lqColSsl", "SSL (ликвидность под минимумами)", "SSL (below lows)", "SSL (低点下方)"],
  ["ind.p.lqColSwept", "Снятые уровни", "Swept levels", "已扫除水平"],

  /* high-volume nodes */
  ["ind.liq_hvn.name", "Зоны скопления объёма (HVN)", "Volume clusters (HVN)", "成交量密集区 (HVN)"],
  [
    "ind.liq_hvn.desc",
    "Горизонтальные зоны повышенного объёма за последние N баров по свечам: топ-N узлов и POC, зоны принятия цены",
    "Horizontal high-volume zones of the last N bars built from candles: the top-N nodes and the POC, areas where price was accepted",
    "基于K线统计最近 N 根的水平成交密集区：前 N 个节点与 POC，价格接受区域",
  ],
  ["ind.p.hvLookback", "Окно, баров", "Window, bars", "统计窗口 (K线数)"],
  ["ind.p.hvRows", "Число ценовых строк", "Price rows", "价格分层数"],
  ["ind.p.hvSmooth", "Сглаживание профиля, проходов", "Profile smoothing, passes", "分布平滑次数"],
  ["ind.p.hvTop", "Сколько узлов показывать", "Nodes to show", "显示节点数"],
  ["ind.p.hvWidth", "Ширина узла, % от пика", "Node width, % of the peak", "节点宽度 (占峰值 %)"],
  ["ind.p.hvMinVol", "Мин. объём узла, % от POC", "Min. node volume, % of POC", "节点最小量 (占 POC %)"],
  ["ind.p.hvExtend", "Продлевать вправо", "Extend to the right", "向右延伸"],
  ["ind.p.hvPoc", "Линия POC", "POC line", "POC 线"],
  ["ind.p.hvLabel", "Подписи узлов (доля объёма)", "Node labels (volume share)", "节点标签 (成交量占比)"],
  ["ind.p.hvAxis", "Метка POC на шкале цены", "POC tag on the price scale", "价格轴 POC 标签"],
  ["ind.p.hvBorder", "Рамка зоны", "Zone border", "区域边框"],
  ["ind.p.hvOpacity", "Прозрачность заливки, %", "Fill opacity, %", "填充不透明度 %"],
  ["ind.p.hvCol", "Зоны скопления", "Volume zones", "密集区"],
  ["ind.p.hvColPoc", "Линия POC", "POC line", "POC 线"],

  /* delta imbalance */
  ["ind.delta_imb.name", "Дельта-имбаланс (приблизительно)", "Delta imbalance (approximate)", "增量失衡 (近似)"],
  [
    "ind.delta_imb.desc",
    "Приблизительная дельта по форме свечи и объёму (не реальные сделки): бары-имбалансы и стеки подряд идущих имбалансов",
    "Approximate delta from the candle shape and volume (not real trades): imbalance bars and stacks of consecutive imbalances",
    "根据K线形态与成交量估算的近似增量 (非真实逐笔)：失衡柱与连续失衡堆叠",
  ],
  ["ind.p.dlRatio", "Порог имбаланса |Δ| / объём", "Imbalance threshold |Δ| / volume", "失衡阈值 |Δ| / 成交量"],
  ["ind.p.dlStack", "Баров в стеке (подряд)", "Bars in a stack (in a row)", "堆叠K线数 (连续)"],
  ["ind.p.dlVolMult", "Объём бара не ниже, × среднего", "Bar volume at least, × average", "成交量不低于均量 ×"],
  ["ind.p.dlMaLen", "Период среднего объёма", "Average volume length", "均量周期"],
  ["ind.p.dlColBuy", "Имбаланс покупателей", "Buy imbalance", "买方失衡"],
  ["ind.p.dlColSell", "Имбаланс продавцов", "Sell imbalance", "卖方失衡"],
  ["ind.p.dlColStack", "Стек имбалансов", "Imbalance stack", "失衡堆叠"],
  ["ind.dl.approx", "приблизительно (по свечам)", "approx. (from candles)", "近似 (基于K线)"],
  ["ind.dl.buyImb", "имбаланс покупок", "buy imbalance", "买方失衡"],
  ["ind.dl.sellImb", "имбаланс продаж", "sell imbalance", "卖方失衡"],
];

function pick(i: 1 | 2 | 3): Record<string, string> {
  const o: Record<string, string> = {};
  for (const r of rows) o[r[0]] = r[i];
  return o;
}

const dict: SectionDict = { ru: pick(1), en: pick(2), cn: pick(3) };

export default dict;
