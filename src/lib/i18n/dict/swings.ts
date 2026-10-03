import type { SectionDict } from "./types";

// Swings (Double ZigZag with High/Low prints) indicator: catalog entry, parameters, legend and the texts painted on the chart.
const rows: [string, string, string, string][] = [
  ["ind.swings_zz.name", "Свинги (двойной ZigZag)", "Swings (Double ZigZag)", "摆动点 (双ZigZag)"],
  [
    "ind.swings_zz.desc",
    "Два слоя зигзага (быстрый и медленный) через свинг-максимумы и минимумы, цена на каждом свинге, HH/HL/LH/LL, уровни поддержки и сопротивления по крупным свингам",
    "Two zig-zag layers (fast and slow) through swing highs and lows, a price print at every swing, HH/HL/LH/LL tags and support / resistance levels from the major swings",
    "快慢两层之字折线连接摆动高低点，每个摆动点标注价格，HH/HL/LH/LL 标记，以及来自大级别摆动的支撑阻力位",
  ],
  ["ind.p.szShow", "Показывать зигзаги", "Show zig zags", "显示之字线"],
  ["ind.sz.s.both", "Оба зигзага", "Show both", "显示两层"],
  ["ind.sz.s.l1", "Только зигзаг 1", "Show ZigZag 1", "仅显示之字线 1"],
  ["ind.sz.s.l2", "Только зигзаг 2", "Show ZigZag 2", "仅显示之字线 2"],
  ["ind.sz.s.none", "Скрыть оба", "Show none", "全部隐藏"],
  ["ind.p.szMode1", "Зигзаг 1: режим", "Zig zag 1: mode", "之字线 1: 模式"],
  ["ind.p.szBars1", "Зигзаг 1: баров слева/справа (пивоты)", "Zig zag 1: bars each side (Pivot mode)", "之字线 1: 左右K线数 (枢轴模式)"],
  ["ind.p.szPct1", "Зигзаг 1: отклонение, % (режим %)", "Zig zag 1: deviation, % (Deviation mode)", "之字线 1: 偏离 % (偏离模式)"],
  ["ind.p.szAtr1", "Зигзаг 1: множитель ATR (режим ATR)", "Zig zag 1: ATR multiplier (ATR mode)", "之字线 1: ATR 倍数 (ATR模式)"],
  ["ind.p.szMode2", "Зигзаг 2: режим", "Zig zag 2: mode", "之字线 2: 模式"],
  ["ind.p.szBars2", "Зигзаг 2: баров слева/справа (пивоты)", "Zig zag 2: bars each side (Pivot mode)", "之字线 2: 左右K线数 (枢轴模式)"],
  ["ind.p.szPct2", "Зигзаг 2: отклонение, % (режим %)", "Zig zag 2: deviation, % (Deviation mode)", "之字线 2: 偏离 % (偏离模式)"],
  ["ind.p.szAtr2", "Зигзаг 2: множитель ATR (режим ATR)", "Zig zag 2: ATR multiplier (ATR mode)", "之字线 2: ATR 倍数 (ATR模式)"],
  ["ind.sz.m.pivot", "Пивоты (баров слева/справа)", "Pivot bars (left/right)", "枢轴 (左右K线数)"],
  ["ind.sz.m.pct", "Отклонение, %", "Deviation %", "偏离百分比"],
  ["ind.sz.m.atr", "ATR × k", "ATR × k", "ATR × k"],
  ["ind.p.szLab1", "Цены на свингах зигзага 1", "Price prints on zig zag 1", "之字线 1 价格标注"],
  ["ind.p.szLab2", "Цены на свингах зигзага 2", "Price prints on zig zag 2", "之字线 2 价格标注"],
  ["ind.p.szHHLL", "Метки HH / HL / LH / LL", "HH / HL / LH / LL labels", "HH / HL / LH / LL 标记"],
  ["ind.sz.hh.none", "Не показывать", "Show none", "不显示"],
  ["ind.sz.hh.show", "Показывать HH/LL/HL/LH", "Show HH/LL/HL/LH", "显示 HH/LL/HL/LH"],
  ["ind.p.szXTime", "В метке: дата/время", "In label: date / time", "标注中: 日期/时间"],
  ["ind.p.szXPct", "В метке: % от прошлого свинга", "In label: % from previous swing", "标注中: 相对上一摆动 %"],
  ["ind.p.szXBars", "В метке: баров с прошлого свинга", "In label: bars since previous swing", "标注中: 距上一摆动K线数"],
  ["ind.p.szXVol", "В метке: объём ноги", "In label: volume of the leg", "标注中: 该段成交量"],
  ["ind.p.szConfirmed", "Только подтверждённые (без текущей ноги)", "Show only confirmed (no live leg)", "仅显示已确认 (无实时段)"],
  ["ind.p.szMinGap", "Мин. расстояние между метками, px", "Min. spacing between labels, px", "标注最小间距 px"],
  ["ind.p.szWindow", "Анализировать последних баров", "Analyse last N bars", "分析最近 N 根K线"],
  ["ind.p.szStyle1", "Зигзаг 1: стиль линии", "Zig zag 1 line style", "之字线 1 线型"],
  ["ind.p.szW1", "Зигзаг 1: толщина", "Zig zag 1 line width", "之字线 1 线宽"],
  ["ind.p.szStyle2", "Зигзаг 2: стиль линии", "Zig zag 2 line style", "之字线 2 线型"],
  ["ind.p.szW2", "Зигзаг 2: толщина", "Zig zag 2 line width", "之字线 2 线宽"],
  ["ind.p.szLabSize", "Размер текста метки", "Label font size", "标注字号"],
  ["ind.p.szTextAlpha", "Прозрачность текста, %", "Text transparency, %", "文字透明度 %"],
  ["ind.p.szLevels", "Уровней S/R (последние свинги зигзага 2)", "S/R levels (last swings of zig zag 2)", "支撑阻力位数量 (之字线 2)"],
  ["ind.p.szLvlExt", "Продление уровней", "Level extension", "水平线延伸"],
  ["ind.sz.ext.broken", "До пробоя", "Until broken", "直到被突破"],
  ["ind.sz.ext.right", "До правого края", "To the right edge", "延伸至右侧"],
  ["ind.p.szMerge", "Объединять уровни ближе (ATR)", "Merge levels closer than (ATR)", "合并间距小于 (ATR)"],
  ["ind.p.szLvlWidth", "Толщина уровней", "Level line width", "水平线线宽"],
  ["ind.p.szLvlStyle", "Стиль уровней", "Level line style", "水平线线型"],
  ["ind.p.szC1u", "Зигзаг 1: цвет вверх", "Zig zag 1 up color", "之字线 1 上行颜色"],
  ["ind.p.szC1d", "Зигзаг 1: цвет вниз", "Zig zag 1 down color", "之字线 1 下行颜色"],
  ["ind.p.szC2u", "Зигзаг 2: цвет вверх", "Zig zag 2 up color", "之字线 2 上行颜色"],
  ["ind.p.szC2d", "Зигзаг 2: цвет вниз", "Zig zag 2 down color", "之字线 2 下行颜色"],
  ["ind.p.szLabFill", "Цвет метки", "Label color", "标注底色"],
  ["ind.p.szLabText", "Цвет текста", "Text color", "文字颜色"],
  ["ind.p.szLvlCol", "Цвет уровней S/R", "S/R levels color", "支撑阻力线颜色"],
  ["ind.sz.short", "Свинги ZZ", "Swings ZZ", "摆动 ZZ"],
  ["ind.sz.last", "последний", "last", "最新"],
  ["ind.sz.layer", "Слой {n}", "Layer {n}", "层 {n}"],
  ["ind.sz.swings", "свингов", "swings", "个摆动点"],
  ["ind.sz.barsN", "{n} св.", "{n} bars", "{n} 根"],
];

function pick(i: 1 | 2 | 3): Record<string, string> {
  const o: Record<string, string> = {};
  for (const r of rows) o[r[0]] = r[i];
  return o;
}

const dict: SectionDict = { ru: pick(1), en: pick(2), cn: pick(3) };

export default dict;
