import type { SectionDict } from "./types";

// "Chart Patterns (auto)" indicator: catalog category, name, description, parameter labels and select options.
// Rows are [key, ru, en, cn]; ru is the source language.
const rows: [string, string, string, string][] = [
  ["ind.cat.patterns", "Паттерны", "Patterns", "形态"],
  ["ind.patterns_auto.name", "Графические паттерны (авто)", "Chart Patterns (auto)", "图表形态(自动)"],
  [
    "ind.patterns_auto.desc",
    "Двойные и тройные вершины и дно, голова и плечи, треугольники, клинья, флаги, вымпелы, каналы и др.: статус, цели и стоп",
    "Double/triple tops and bottoms, head & shoulders, triangles, wedges, flags, pennants, channels and more: status, targets and stop",
    "双顶/双底、三重顶底、头肩、三角形、楔形、旗形、三角旗、通道等：状态、目标位与止损",
  ],

  /* which patterns */
  ["ind.p.paDouble", "Двойная вершина / двойное дно", "Double top / double bottom", "双顶 / 双底"],
  ["ind.p.paTriple", "Тройная вершина / тройное дно", "Triple top / triple bottom", "三重顶 / 三重底"],
  ["ind.p.paHs", "Голова и плечи (и перевёрнутая)", "Head & shoulders (and inverse)", "头肩顶 / 头肩底"],
  ["ind.p.paTri", "Треугольники (восх., нисх., симметричный)", "Triangles (ascending, descending, symmetrical)", "三角形 (上升/下降/对称)"],
  ["ind.p.paWedge", "Клинья (восходящий, нисходящий)", "Wedges (rising, falling)", "楔形 (上升/下降)"],
  ["ind.p.paFlag", "Флаги (бычий, медвежий)", "Flags (bull, bear)", "旗形 (牛/熊)"],
  ["ind.p.paPennant", "Вымпелы (бычий, медвежий)", "Pennants (bull, bear)", "三角旗 (牛/熊)"],
  ["ind.p.paRect", "Прямоугольник (горизонтальный канал)", "Rectangle (horizontal channel)", "矩形 (水平通道)"],
  ["ind.p.paChannel", "Каналы (восходящий, нисходящий)", "Channels (ascending, descending)", "通道 (上升/下降)"],
  ["ind.p.paBroad", "Расширяющаяся формация (мегафон)", "Broadening formation (megaphone)", "扩散形态 (喇叭口)"],
  ["ind.p.paCup", "Чашка с ручкой", "Cup & handle", "杯柄形态"],
  ["ind.p.paRound", "Круглое дно / круглая вершина", "Rounding bottom / top", "圆弧底 / 圆弧顶"],

  /* detection */
  ["ind.p.paDegree", "Чувствительность (степень)", "Sensitivity (degree)", "灵敏度 (级别)"],
  ["ind.pa.o.auto", "Авто (все степени)", "Auto (all degrees)", "自动 (全部级别)"],
  ["ind.pa.o.fine", "Мелкая (1,7 ATR)", "Fine (1.7 ATR)", "精细 (1.7 ATR)"],
  ["ind.pa.o.normal", "Средняя (2,6 ATR)", "Medium (2.6 ATR)", "中等 (2.6 ATR)"],
  ["ind.pa.o.coarse", "Крупная (4,2 ATR)", "Large (4.2 ATR)", "粗略 (4.2 ATR)"],
  ["ind.p.paMinConf", "Мин. уверенность, %", "Min confidence, %", "最低置信度 %"],
  ["ind.p.paMinBars", "Мин. длина паттерна, баров", "Min pattern length, bars", "形态最小长度 (根)"],
  ["ind.p.paMaxBars", "Макс. длина паттерна, баров", "Max pattern length, bars", "形态最大长度 (根)"],
  ["ind.p.paTol", "Допуск касания, ATR", "Touch tolerance, ATR", "触及容差 (ATR)"],
  ["ind.p.paBufMode", "Буфер пробоя", "Breakout buffer", "突破缓冲"],
  ["ind.pa.o.atr", "в ATR", "in ATR", "按 ATR"],
  ["ind.pa.o.pct", "в процентах цены", "in % of price", "按价格百分比"],
  ["ind.p.paBufAtr", "Буфер пробоя, ATR", "Breakout buffer, ATR", "突破缓冲 (ATR)"],
  ["ind.p.paBufPct", "Буфер пробоя, %", "Breakout buffer, %", "突破缓冲 (%)"],
  ["ind.p.paClose", "Пробой только по закрытию бара", "Breakout needs a close beyond the line", "收盘价突破才确认"],
  ["ind.p.paMax", "Макс. паттернов на экране", "Max patterns on screen", "屏幕最多形态数"],
  ["ind.p.paWindow", "Окно анализа, последних баров", "Analysis window, last bars", "分析窗口 (最近 K 线数)"],
  ["ind.p.paMaxAge", "Макс. возраст паттерна, баров", "Max pattern age, bars", "形态最长保留 (根)"],
  ["ind.p.paFailed", "Показывать неотработавшие", "Show failed patterns", "显示失败形态"],

  /* drawing */
  ["ind.p.paTargets", "Показывать цели", "Show targets", "显示目标位"],
  ["ind.p.paStops", "Показывать стоп", "Show stop", "显示止损"],
  ["ind.p.paZone", "Зона цели (заливка)", "Target zone (fill)", "目标区域 (填充)"],
  ["ind.p.paPivots", "Маркеры вершин", "Pivot markers", "显示转折点标记"],
  ["ind.p.paLabels", "Подписи паттернов", "Pattern labels", "显示形态标签"],

  /* colours */
  ["ind.p.paColUp", "Цвет: бычий", "Colour: bullish", "颜色: 看涨"],
  ["ind.p.paColDown", "Цвет: медвежий", "Colour: bearish", "颜色: 看跌"],
  ["ind.p.paColFlat", "Цвет: нейтральный", "Colour: neutral", "颜色: 中性"],
  ["ind.p.paColStop", "Цвет: стоп", "Colour: stop", "颜色: 止损"],

  /* Wolfe waves */
  ["ind.wolfe.name", "Волны Вульфа (авто)", "Wolfe Waves (auto)", "沃尔夫波浪(自动)"],
  [
    "ind.wolfe.desc",
    "Бычьи и медвежьи волны Вульфа по 5 точкам: сходящиеся линии 1-3 и 2-4, зона проникновения точки 5 и целевая линия 1→4 (EPA) с ожидаемым временем",
    "Bullish and bearish five-point Wolfe waves: converging 1-3 and 2-4 lines, the sweet zone for point 5 and the 1→4 target line (EPA) with the estimated arrival",
    "五点看涨/看跌沃尔夫波浪：收敛的 1-3 与 2-4 线、第5点甜蜜区以及 1→4 目标线 (EPA) 与预计到达时间",
  ],
  ["ind.p.wfBull", "Бычьи волны (вверх)", "Bullish waves (up)", "看涨波浪 (向上)"],
  ["ind.p.wfBear", "Медвежьи волны (вниз)", "Bearish waves (down)", "看跌波浪 (向下)"],
  ["ind.p.wfMode", "Размах свингов", "Swing size", "摆动幅度"],
  ["ind.wf.o.atr", "в ATR (адаптивно)", "in ATR (adaptive)", "按 ATR (自适应)"],
  ["ind.wf.o.pct", "в процентах цены", "in % of price", "按价格百分比"],
  ["ind.p.wfDevAtr", "Отклонение свинга, ATR", "Swing deviation, ATR", "摆动偏差 (ATR)"],
  ["ind.p.wfDevPct", "Отклонение свинга, %", "Swing deviation, %", "摆动偏差 (%)"],
  ["ind.p.wfTol", "Допуск касания линии 1-3, ATR", "Touch tolerance of the 1-3 line, ATR", "触及 1-3 线的容差 (ATR)"],
  ["ind.p.wfLegRatio", "Макс. разброс длины волн (раз)", "Max leg length ratio (times)", "各波最大长度比 (倍)"],
  ["ind.p.wfMinBars", "Мин. длина 1→5, баров", "Min length 1→5, bars", "1→5 最小长度 (根)"],
  ["ind.p.wfMaxBars", "Макс. длина 1→5, баров", "Max length 1→5, bars", "1→5 最大长度 (根)"],
  ["ind.p.wfMinConf", "Мин. уверенность, %", "Min confidence, %", "最低置信度 %"],
  ["ind.p.wfMax", "Макс. волн на экране", "Max waves on screen", "屏幕最多波浪数"],
  ["ind.p.wfWindow", "Окно анализа, последних баров", "Analysis window, last bars", "分析窗口 (最近 K 线数)"],
  ["ind.p.wfDone", "Показывать завершённые (бледно)", "Show finished waves (faded)", "显示已结束的波浪 (淡色)"],
  ["ind.p.wfTarget", "Целевая линия 1→4 (EPA)", "Target line 1→4 (EPA)", "目标线 1→4 (EPA)"],
  ["ind.p.wfZone", "Зона проникновения точки 5 (sweet zone)", "Sweet zone of point 5", "第5点甜蜜区"],
  ["ind.p.wfLines", "Линии 1-3 и 2-4 и их продолжение", "Lines 1-3 and 2-4 and their extension", "1-3 与 2-4 线及其延伸"],
  ["ind.p.wfNumbers", "Номера точек 1-5", "Point numbers 1-5", "显示点位编号 1-5"],
  ["ind.p.wfLabels", "Подпись волны", "Wave label", "显示波浪标签"],
  ["ind.p.wfColUp", "Цвет: бычья", "Colour: bullish", "颜色: 看涨"],
  ["ind.p.wfColDown", "Цвет: медвежья", "Colour: bearish", "颜色: 看跌"],
  ["ind.p.wfColTarget", "Цвет: цель (EPA)", "Colour: target (EPA)", "颜色: 目标 (EPA)"],
  ["ind.p.wfColZone", "Цвет: зона точки 5", "Colour: point 5 zone", "颜色: 第5点区域"],
];

const dict: SectionDict = { ru: {}, en: {}, cn: {} };
for (const [key, ru, en, cn] of rows) {
  dict.ru[key] = ru;
  dict.en[key] = en;
  dict.cn[key] = cn;
}

export default dict;
