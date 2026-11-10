/* Classic candlestick patterns: the catalogue (id, number of candles, bias, required prior trend, priority, names / short labels / one-line
   meaning in ru / en / cn). Plain data, no imports: the detector (candles.ts), the indicator painter (indicators/candles-def.ts) and the
   i18n dictionary (dict/patterns2.ts builds the checklist labels from it) all read this one table. */

export type CandleId =
  | "doji" | "dragonfly" | "gravestone" | "longlegged"
  | "hammer" | "invhammer" | "hanging" | "shooting"
  | "maru_bull" | "maru_bear" | "spinning" | "belt_bull" | "belt_bear"
  | "engulf_bull" | "engulf_bear" | "harami_bull" | "harami_bear" | "haramix_bull" | "haramix_bear"
  | "piercing" | "darkcloud" | "tweezer_bottom" | "tweezer_top" | "kicker_bull" | "kicker_bear"
  | "morning" | "evening" | "morning_doji" | "evening_doji" | "abandoned_bull" | "abandoned_bear"
  | "soldiers" | "crows" | "inside_up" | "inside_down" | "outside_up" | "outside_down"
  | "rising3" | "falling3"
  | "window_up" | "window_down" | "counter_bull" | "counter_bear" | "separating_bull" | "separating_bear"
  | "onneck" | "inneck" | "thrusting" | "homing_pigeon" | "matching_low" | "matching_high"
  | "tasuki_up" | "tasuki_down" | "sidebyside_bull" | "sidebyside_bear" | "tristar_bull" | "tristar_bear"
  | "advance_block" | "deliberation" | "two_crows" | "upgap_two_crows" | "three_river" | "stick_sandwich" | "stick_sandwich_bear"
  | "strike_bull" | "strike_bear" | "concealing_swallow"
  | "mathold" | "mathold_bear" | "ladder_bottom" | "breakaway_bull" | "breakaway_bear" | "island_top" | "island_bottom";

export type CandleBias = "bull" | "bear" | "flat";
export type Tri = [string, string, string];

export interface CandleMeta {
  id: CandleId;
  /** Candles in the pattern (the marker sits on the last one). For a variable-length pattern this is the textbook count (it also picks the
      checklist group) and `span` holds the real limits. */
  bars: 1 | 2 | 3 | 4 | 5;
  /** Variable-length patterns: the fewest and the most candles a hit can take. */
  span?: [number, number];
  /** Sub-patterns this one swallows: their hit one bar earlier, on the same candles, is dropped when this pattern completes
      (three-line strike = soldiers / crows + one candle). */
  absorbs?: CandleId[];
  bias: CandleBias;
  /** Trend that must precede the pattern when the «trend context» option is on: -1 down, 1 up, 0 none needed. */
  trend: -1 | 0 | 1;
  /** Who wins when several patterns end on the same bar (higher = stronger). */
  prio: number;
  /** In the «Main» preset. */
  main?: boolean;
  name: Tri;
  short: Tri;
  desc: Tri;
}

export const CANDLE_META: CandleMeta[] = [
  /* ───── one candle ───── */
  {
    id: "doji", bars: 1, bias: "flat", trend: 0, prio: 20, main: true,
    name: ["Доджи", "Doji", "十字星"],
    short: ["Дж", "Doji", "十字"],
    desc: ["Открытие и закрытие почти равны: рынок в нерешительности, после сильного хода возможен разворот или пауза.", "Open and close are almost equal: indecision, after a strong move it hints at a pause or a reversal.", "开盘与收盘几乎相等：多空犹豫，强势行情后可能暂停或反转。"],
  },
  {
    id: "dragonfly", bars: 1, bias: "flat", trend: 0, prio: 24,
    name: ["Доджи-стрекоза", "Dragonfly doji", "蜻蜓十字"],
    short: ["Стр", "Drag", "蜻蜓"],
    desc: ["Длинная нижняя тень без верхней: продавцов выкупили, у поддержки это сигнал возможного отскока вверх.", "Long lower shadow, no upper one: sellers were absorbed, at support it hints at a bounce up.", "长下影线、无上影线：卖盘被消化，在支撑位提示可能反弹。"],
  },
  {
    id: "gravestone", bars: 1, bias: "flat", trend: 0, prio: 24,
    name: ["Доджи-надгробие", "Gravestone doji", "墓碑十字"],
    short: ["Над", "Grave", "墓碑"],
    desc: ["Длинная верхняя тень без нижней: покупателей отбили, у сопротивления это сигнал возможного отката вниз.", "Long upper shadow, no lower one: buyers were rejected, at resistance it hints at a pullback down.", "长上影线、无下影线：买盘被打回，在阻力位提示可能回落。"],
  },
  {
    id: "longlegged", bars: 1, bias: "flat", trend: 0, prio: 22,
    name: ["Длинноногий доджи", "Long-legged doji", "长腿十字"],
    short: ["ДлДж", "LLDoji", "长腿"],
    desc: ["Обе тени длинные, тело крошечное: сильная борьба без победителя, рынок на развилке.", "Both shadows long, tiny body: a hard fight with no winner, the market is at a fork.", "上下影线都长、实体极小：多空激烈搏杀无胜者，市场处于十字路口。"],
  },
  {
    id: "hammer", bars: 1, bias: "bull", trend: -1, prio: 40, main: true,
    name: ["Молот", "Hammer", "锤头线"],
    short: ["Мол", "Ham", "锤"],
    desc: ["Маленькое тело вверху и длинная нижняя тень после снижения: продавцов выкупили, возможен разворот вверх.", "Small body on top and a long lower shadow after a decline: sellers were bought out, a reversal up is possible.", "下跌后实体小位于上方、下影线长：卖盘被承接，可能向上反转。"],
  },
  {
    id: "invhammer", bars: 1, bias: "bull", trend: -1, prio: 36,
    name: ["Перевёрнутый молот", "Inverted hammer", "倒锤头线"],
    short: ["ПМол", "InvH", "倒锤"],
    desc: ["Маленькое тело внизу и длинная верхняя тень после снижения: покупатели пробуют силу, нужен рост на следующей свече.", "Small body at the bottom and a long upper shadow after a decline: buyers test their strength, needs a confirming up candle.", "下跌后实体小位于下方、上影线长：多头试探，需下一根上涨确认。"],
  },
  {
    id: "hanging", bars: 1, bias: "bear", trend: 1, prio: 38,
    name: ["Повешенный", "Hanging man", "上吊线"],
    short: ["Пов", "Hang", "吊"],
    desc: ["Форма молота после роста: на хаях появились активные продавцы, возможен разворот вниз.", "A hammer shape after a rise: active sellers showed up at the highs, a reversal down is possible.", "上涨后出现锤头形态：高位出现主动卖盘，可能向下反转。"],
  },
  {
    id: "shooting", bars: 1, bias: "bear", trend: 1, prio: 42, main: true,
    name: ["Падающая звезда", "Shooting star", "流星线"],
    short: ["ПЗв", "Shoot", "流星"],
    desc: ["Маленькое тело внизу и длинная верхняя тень после роста: покупателей отбили, возможен разворот вниз.", "Small body at the bottom and a long upper shadow after a rise: buyers were rejected, a reversal down is possible.", "上涨后实体小位于下方、上影线长：多头被打回，可能向下反转。"],
  },
  {
    id: "maru_bull", bars: 1, bias: "bull", trend: 0, prio: 30,
    name: ["Бычий марубозу", "Bullish marubozu", "光头光脚阳线"],
    short: ["Мар↑", "Maru↑", "阳线↑"],
    desc: ["Длинная бычья свеча без теней: покупатели контролировали весь бар, продолжение вверх вероятнее.", "A long bullish candle with no shadows: buyers controlled the whole bar, continuation up is more likely.", "无影线的长阳线：多头全程掌控，延续上涨的概率较大。"],
  },
  {
    id: "maru_bear", bars: 1, bias: "bear", trend: 0, prio: 30,
    name: ["Медвежий марубозу", "Bearish marubozu", "光头光脚阴线"],
    short: ["Мар↓", "Maru↓", "阴线↓"],
    desc: ["Длинная медвежья свеча без теней: продавцы контролировали весь бар, продолжение вниз вероятнее.", "A long bearish candle with no shadows: sellers controlled the whole bar, continuation down is more likely.", "无影线的长阴线：空头全程掌控，延续下跌的概率较大。"],
  },
  {
    id: "spinning", bars: 1, bias: "flat", trend: 0, prio: 18,
    name: ["Волчок", "Spinning top", "纺锤线"],
    short: ["Вол", "Spin", "纺锤"],
    desc: ["Маленькое тело и тени с обеих сторон: ни покупатели, ни продавцы не взяли верх, импульс затухает.", "Small body with shadows on both sides: neither side won, momentum is fading.", "实体小、上下均有影线：多空都未占优，动能减弱。"],
  },
  {
    id: "belt_bull", bars: 1, bias: "bull", trend: -1, prio: 28,
    name: ["Бычий захват за пояс", "Bullish belt-hold", "看涨腰带线"],
    short: ["Пояс↑", "Belt↑", "腰带↑"],
    desc: ["Длинная бычья свеча открывается на минимуме после снижения: покупатели сразу взяли инициативу.", "A long bullish candle opening at its low after a decline: buyers took the initiative at once.", "下跌后开盘即最低价的长阳线：多头一开盘就掌握主动。"],
  },
  {
    id: "belt_bear", bars: 1, bias: "bear", trend: 1, prio: 28,
    name: ["Медвежий захват за пояс", "Bearish belt-hold", "看跌腰带线"],
    short: ["Пояс↓", "Belt↓", "腰带↓"],
    desc: ["Длинная медвежья свеча открывается на максимуме после роста: продавцы сразу взяли инициативу.", "A long bearish candle opening at its high after a rise: sellers took the initiative at once.", "上涨后开盘即最高价的长阴线：空头一开盘就掌握主动。"],
  },

  /* ───── two candles ───── */
  {
    id: "engulf_bull", bars: 2, bias: "bull", trend: -1, prio: 70, main: true,
    name: ["Бычье поглощение", "Bullish engulfing", "看涨吞没"],
    short: ["Погл↑", "Eng↑", "吞没↑"],
    desc: ["Бычья свеча полностью перекрывает тело предыдущей медвежьей после снижения: покупатели перехватили инициативу.", "A bullish candle fully covers the body of the previous bearish one after a decline: buyers took control.", "下跌后阳线实体完全包住前一根阴线实体：多头夺回主动权。"],
  },
  {
    id: "engulf_bear", bars: 2, bias: "bear", trend: 1, prio: 70, main: true,
    name: ["Медвежье поглощение", "Bearish engulfing", "看跌吞没"],
    short: ["Погл↓", "Eng↓", "吞没↓"],
    desc: ["Медвежья свеча полностью перекрывает тело предыдущей бычьей после роста: продавцы перехватили инициативу.", "A bearish candle fully covers the body of the previous bullish one after a rise: sellers took control.", "上涨后阴线实体完全包住前一根阳线实体：空头夺回主动权。"],
  },
  {
    id: "harami_bull", bars: 2, bias: "bull", trend: -1, prio: 50,
    name: ["Бычье харами", "Bullish harami", "看涨孕线"],
    short: ["Хар↑", "Har↑", "孕线↑"],
    desc: ["Маленькая бычья свеча внутри тела длинной медвежьей: давление продавцов ослабло, возможен разворот вверх.", "A small bullish candle inside the body of a long bearish one: selling pressure eased, a reversal up is possible.", "小阳线位于长阴线实体之内：卖压减弱，可能向上反转。"],
  },
  {
    id: "harami_bear", bars: 2, bias: "bear", trend: 1, prio: 50,
    name: ["Медвежье харами", "Bearish harami", "看跌孕线"],
    short: ["Хар↓", "Har↓", "孕线↓"],
    desc: ["Маленькая медвежья свеча внутри тела длинной бычьей: рост выдыхается, возможен разворот вниз.", "A small bearish candle inside the body of a long bullish one: the rise is running out of steam, a reversal down is possible.", "小阴线位于长阳线实体之内：涨势乏力，可能向下反转。"],
  },
  {
    id: "haramix_bull", bars: 2, bias: "bull", trend: -1, prio: 56,
    name: ["Бычье харами-кросс", "Bullish harami cross", "看涨十字孕线"],
    short: ["ХарД↑", "HarX↑", "十孕↑"],
    desc: ["Доджи внутри тела длинной медвежьей свечи: снижение остановилось в нерешительности, возможен разворот вверх.", "A doji inside the body of a long bearish candle: the decline stalled in indecision, a reversal up is possible.", "十字星位于长阴线实体之内：跌势在犹豫中停滞，可能向上反转。"],
  },
  {
    id: "haramix_bear", bars: 2, bias: "bear", trend: 1, prio: 56,
    name: ["Медвежье харами-кросс", "Bearish harami cross", "看跌十字孕线"],
    short: ["ХарД↓", "HarX↓", "十孕↓"],
    desc: ["Доджи внутри тела длинной бычьей свечи: рост остановился в нерешительности, возможен разворот вниз.", "A doji inside the body of a long bullish candle: the rise stalled in indecision, a reversal down is possible.", "十字星位于长阳线实体之内：涨势在犹豫中停滞，可能向下反转。"],
  },
  {
    id: "piercing", bars: 2, bias: "bull", trend: -1, prio: 60,
    name: ["Проникающая линия", "Piercing line", "刺透形态"],
    short: ["Прон", "Pierc", "刺透"],
    desc: ["После длинной медвежьей свечи бычья открывается ниже и закрывается выше середины её тела: покупатели отыгрывают падение.", "After a long bearish candle a bullish one opens lower and closes above the middle of its body: buyers win back the drop.", "长阴线之后阳线低开并收于其实体中点之上：多头收复跌幅。"],
  },
  {
    id: "darkcloud", bars: 2, bias: "bear", trend: 1, prio: 60,
    name: ["Завеса из тёмных облаков", "Dark cloud cover", "乌云盖顶"],
    short: ["Зав", "Cloud", "乌云"],
    desc: ["После длинной бычьей свечи медвежья открывается выше и закрывается ниже середины её тела: продавцы стирают рост.", "After a long bullish candle a bearish one opens higher and closes below the middle of its body: sellers erase the rise.", "长阳线之后阴线高开并收于其实体中点之下：空头抹去涨幅。"],
  },
  {
    id: "tweezer_bottom", bars: 2, bias: "bull", trend: -1, prio: 46,
    name: ["Пинцет (дно)", "Tweezer bottom", "平头底部"],
    short: ["Пинц↑", "Tw↑", "平底"],
    desc: ["Две соседние свечи любого цвета с одинаковыми минимумами после снижения: уровень выдержал повторный тест, возможен разворот вверх.", "Two adjacent candles of any colour with equal lows after a decline: the level held a second test, a reversal up is possible.", "下跌后相邻两根K线（颜色不限）最低价相同：该位置经受住再次测试，可能向上反转。"],
  },
  {
    id: "tweezer_top", bars: 2, bias: "bear", trend: 1, prio: 46,
    name: ["Пинцет (вершина)", "Tweezer top", "平头顶部"],
    short: ["Пинц↓", "Tw↓", "平顶"],
    desc: ["Две соседние свечи любого цвета с одинаковыми максимумами после роста: уровень отразил повторную атаку, возможен разворот вниз.", "Two adjacent candles of any colour with equal highs after a rise: the level repelled a second attack, a reversal down is possible.", "上涨后相邻两根K线（颜色不限）最高价相同：该位置挡住再次冲击，可能向下反转。"],
  },
  {
    id: "kicker_bull", bars: 2, bias: "bull", trend: -1, prio: 92,
    name: ["Бычий кикер", "Bullish kicker", "看涨反冲"],
    short: ["Кик↑", "Kick↑", "反冲↑"],
    desc: ["Сильная бычья свеча открывается выше открытия предыдущей медвежьей: резкая смена настроения, один из самых сильных разворотных сигналов. На круглосуточных рынках редок.", "A strong bullish candle opens above the open of the previous bearish one: a sharp change of mood, one of the strongest reversal signals. Rare on 24h markets.", "强势阳线开盘高于前一根阴线开盘价：情绪急转，最强的反转信号之一。24小时市场中罕见。"],
  },
  {
    id: "kicker_bear", bars: 2, bias: "bear", trend: 1, prio: 92,
    name: ["Медвежий кикер", "Bearish kicker", "看跌反冲"],
    short: ["Кик↓", "Kick↓", "反冲↓"],
    desc: ["Сильная медвежья свеча открывается ниже открытия предыдущей бычьей: резкая смена настроения, один из самых сильных разворотных сигналов. На круглосуточных рынках редок.", "A strong bearish candle opens below the open of the previous bullish one: a sharp change of mood, one of the strongest reversal signals. Rare on 24h markets.", "强势阴线开盘低于前一根阳线开盘价：情绪急转，最强的反转信号之一。24小时市场中罕见。"],
  },
  {
    id: "window_up", bars: 2, bias: "bull", trend: 0, prio: 34,
    name: ["Окно вверх", "Rising window", "向上跳空窗口"],
    short: ["Окно↑", "Win↑", "窗口↑"],
    desc: ["Ценовой разрыв вверх: минимум свечи выше максимума предыдущей. Сигнал продолжения роста, само окно становится поддержкой.", "A price gap up: the low of the candle is above the high of the previous one. A continuation signal, the window itself becomes support.", "向上跳空：本根最低价高于前一根最高价。上涨延续信号，窗口本身成为支撑。"],
  },
  {
    id: "window_down", bars: 2, bias: "bear", trend: 0, prio: 34,
    name: ["Окно вниз", "Falling window", "向下跳空窗口"],
    short: ["Окно↓", "Win↓", "窗口↓"],
    desc: ["Ценовой разрыв вниз: максимум свечи ниже минимума предыдущей. Сигнал продолжения снижения, само окно становится сопротивлением.", "A price gap down: the high of the candle is below the low of the previous one. A continuation signal, the window itself becomes resistance.", "向下跳空：本根最高价低于前一根最低价。下跌延续信号，窗口本身成为阻力。"],
  },
  {
    id: "counter_bull", bars: 2, bias: "bull", trend: -1, prio: 54,
    name: ["Бычья контратака (встречные линии)", "Bullish counterattack (meeting lines)", "看涨反击线"],
    short: ["Контр↑", "Cntr↑", "反击↑"],
    desc: ["После длинной медвежьей свечи длинная бычья открывается намного ниже и закрывается на уровне её закрытия: покупатели остановили падение, сигнал слабее проникающей линии.", "After a long bearish candle a long bullish one opens much lower and closes at the same close: buyers stopped the fall, weaker than a piercing line.", "长阴线之后长阳线大幅低开并收于同一收盘价：多头止住跌势，信号弱于刺透形态。"],
  },
  {
    id: "counter_bear", bars: 2, bias: "bear", trend: 1, prio: 54,
    name: ["Медвежья контратака (встречные линии)", "Bearish counterattack (meeting lines)", "看跌反击线"],
    short: ["Контр↓", "Cntr↓", "反击↓"],
    desc: ["После длинной бычьей свечи длинная медвежья открывается намного выше и закрывается на уровне её закрытия: продавцы остановили рост, сигнал слабее завесы из тёмных облаков.", "After a long bullish candle a long bearish one opens much higher and closes at the same close: sellers stopped the rise, weaker than a dark cloud cover.", "长阳线之后长阴线大幅高开并收于同一收盘价：空头止住涨势，信号弱于乌云盖顶。"],
  },
  {
    id: "separating_bull", bars: 2, bias: "bull", trend: 1, prio: 55,
    name: ["Бычьи разделяющие линии", "Bullish separating lines", "看涨分手线"],
    short: ["Разд↑", "Sep↑", "分手↑"],
    desc: ["В восходящем тренде после медвежьей свечи длинная бычья открывается на уровне её открытия и уходит вверх: откат закончен, рост продолжается.", "In an uptrend a long bullish candle opens at the open of the previous bearish one and runs up: the pullback is over, the rise goes on.", "上升趋势中，长阳线在前一根阴线的开盘价处开盘并上行：回调结束，涨势延续。"],
  },
  {
    id: "separating_bear", bars: 2, bias: "bear", trend: -1, prio: 55,
    name: ["Медвежьи разделяющие линии", "Bearish separating lines", "看跌分手线"],
    short: ["Разд↓", "Sep↓", "分手↓"],
    desc: ["В нисходящем тренде после бычьей свечи длинная медвежья открывается на уровне её открытия и уходит вниз: отскок закончен, снижение продолжается.", "In a downtrend a long bearish candle opens at the open of the previous bullish one and runs down: the bounce is over, the decline goes on.", "下降趋势中，长阴线在前一根阳线的开盘价处开盘并下行：反弹结束，跌势延续。"],
  },
  {
    id: "onneck", bars: 2, bias: "bear", trend: -1, prio: 44,
    name: ["У линии шеи", "On-neck line", "颈上线"],
    short: ["УШеи", "OnNk", "颈上"],
    desc: ["После длинной медвежьей свечи бычья открывается ниже и закрывается лишь у её минимума: отскок слабый, снижение скорее продолжится.", "After a long bearish candle a bullish one opens lower and closes only at its low: a weak bounce, the decline is likely to go on.", "长阴线之后阳线低开，仅收于其最低价附近：反弹乏力，跌势多半延续。"],
  },
  {
    id: "inneck", bars: 2, bias: "bear", trend: -1, prio: 44,
    name: ["В линии шеи", "In-neck line", "颈内线"],
    short: ["ВШеи", "InNk", "颈内"],
    desc: ["После длинной медвежьей свечи бычья открывается ниже и закрывается у её закрытия, едва войдя в тело: отскок слабый, снижение скорее продолжится.", "After a long bearish candle a bullish one opens lower and closes at its close, barely inside the body: a weak bounce, the decline is likely to go on.", "长阴线之后阳线低开，收于其收盘价附近、仅略入实体：反弹乏力，跌势多半延续。"],
  },
  {
    id: "thrusting", bars: 2, bias: "bear", trend: -1, prio: 45,
    name: ["Толчок", "Thrusting line", "插入线"],
    short: ["Толч", "Thru", "插入"],
    desc: ["После длинной медвежьей свечи бычья открывается ниже и закрывается внутри её тела, но ниже середины: до проникающей линии не дотянула, перевес у продавцов.", "After a long bearish candle a bullish one opens lower and closes inside its body but below the middle: short of a piercing line, sellers keep the edge.", "长阴线之后阳线低开，收于其实体之内但低于中点：未达刺透形态，空头仍占优。"],
  },
  {
    id: "homing_pigeon", bars: 2, bias: "bull", trend: -1, prio: 48,
    name: ["Домашний голубь", "Homing pigeon", "家鸽形态"],
    short: ["Голубь", "Pigeon", "家鸽"],
    desc: ["Маленькая медвежья свеча внутри тела длинной медвежьей после снижения: продавцы теряют напор, возможен разворот вверх.", "A small bearish candle inside the body of a long bearish one after a decline: sellers are losing drive, a reversal up is possible.", "下跌后小阴线位于长阴线实体之内：空头动能减弱，可能向上反转。"],
  },
  {
    id: "matching_low", bars: 2, bias: "bull", trend: -1, prio: 52,
    name: ["Одинаковые минимумы", "Matching low", "相同低价"],
    short: ["МинМин", "MLow", "同低"],
    desc: ["Две медвежьи свечи подряд с одинаковым закрытием после снижения: ниже этого уровня продать не смогли, здесь образуется поддержка.", "Two bearish candles in a row with the same close after a decline: sellers could not push lower, support is forming here.", "下跌后连续两根阴线收盘价相同：空头无法再压低，此处形成支撑。"],
  },
  {
    id: "matching_high", bars: 2, bias: "bear", trend: 1, prio: 52,
    name: ["Одинаковые максимумы", "Matching high", "相同高价"],
    short: ["МаксМакс", "MHigh", "同高"],
    desc: ["Две бычьи свечи подряд с одинаковым закрытием после роста: выше этого уровня купить не смогли, здесь образуется сопротивление.", "Two bullish candles in a row with the same close after a rise: buyers could not push higher, resistance is forming here.", "上涨后连续两根阳线收盘价相同：多头无法再推高，此处形成阻力。"],
  },

  /* ───── three candles ───── */
  {
    id: "morning", bars: 3, bias: "bull", trend: -1, prio: 85, main: true,
    name: ["Утренняя звезда", "Morning star", "启明星"],
    short: ["Утр", "Morn", "启明"],
    desc: ["Длинная медвежья свеча, маленькая «звезда» и бычья свеча выше середины первой: падение выдохлось, разворот вверх.", "A long bearish candle, a small star and a bullish candle above the middle of the first: the fall ran out of steam, a reversal up.", "长阴线、小实体星线、再收于首根中点之上的阳线：跌势衰竭，向上反转。"],
  },
  {
    id: "evening", bars: 3, bias: "bear", trend: 1, prio: 85, main: true,
    name: ["Вечерняя звезда", "Evening star", "黄昏星"],
    short: ["Веч", "Eve", "黄昏"],
    desc: ["Длинная бычья свеча, маленькая «звезда» и медвежья свеча ниже середины первой: рост выдохся, разворот вниз.", "A long bullish candle, a small star and a bearish candle below the middle of the first: the rise ran out of steam, a reversal down.", "长阳线、小实体星线、再收于首根中点之下的阴线：涨势衰竭，向下反转。"],
  },
  {
    id: "morning_doji", bars: 3, bias: "bull", trend: -1, prio: 88,
    name: ["Утренняя звезда доджи", "Morning doji star", "十字启明星"],
    short: ["УтрД", "MornD", "十启"],
    desc: ["Утренняя звезда, где средняя свеча - доджи: нерешительность на дне усиливает сигнал разворота вверх.", "A morning star whose middle candle is a doji: indecision at the bottom strengthens the reversal-up signal.", "中间为十字星的启明星：低位的犹豫强化向上反转信号。"],
  },
  {
    id: "evening_doji", bars: 3, bias: "bear", trend: 1, prio: 88,
    name: ["Вечерняя звезда доджи", "Evening doji star", "十字黄昏星"],
    short: ["ВечД", "EveD", "十黄"],
    desc: ["Вечерняя звезда, где средняя свеча - доджи: нерешительность на вершине усиливает сигнал разворота вниз.", "An evening star whose middle candle is a doji: indecision at the top strengthens the reversal-down signal.", "中间为十字星的黄昏星：高位的犹豫强化向下反转信号。"],
  },
  {
    id: "abandoned_bull", bars: 3, bias: "bull", trend: -1, prio: 95,
    name: ["Бычий брошенный младенец", "Bullish abandoned baby", "看涨弃婴"],
    short: ["Брош↑", "Aband↑", "弃婴↑"],
    desc: ["Доджи отделён гэпами от медвежьей и бычьей свечей: редкий и сильный сигнал разворота вверх.", "A doji separated by gaps from the bearish and the bullish candle: a rare and strong reversal-up signal.", "十字星与前后阴阳线均以缺口隔开：罕见而强烈的向上反转信号。"],
  },
  {
    id: "abandoned_bear", bars: 3, bias: "bear", trend: 1, prio: 95,
    name: ["Медвежий брошенный младенец", "Bearish abandoned baby", "看跌弃婴"],
    short: ["Брош↓", "Aband↓", "弃婴↓"],
    desc: ["Доджи отделён гэпами от бычьей и медвежьей свечей: редкий и сильный сигнал разворота вниз.", "A doji separated by gaps from the bullish and the bearish candle: a rare and strong reversal-down signal.", "十字星与前后阳阴线均以缺口隔开：罕见而强烈的向下反转信号。"],
  },
  {
    id: "soldiers", bars: 3, bias: "bull", trend: 0, prio: 80,
    name: ["Три белых солдата", "Three white soldiers", "红三兵"],
    short: ["3Сол", "3WS", "红三兵"],
    desc: ["Три бычьи свечи подряд с ростом закрытий и короткими верхними тенями: устойчивый приток покупателей.", "Three bullish candles in a row with rising closes and short upper shadows: steady buying.", "连续三根阳线、收盘逐步抬高且上影线短：买盘持续涌入。"],
  },
  {
    id: "crows", bars: 3, bias: "bear", trend: 0, prio: 80,
    name: ["Три чёрные вороны", "Three black crows", "三只乌鸦"],
    short: ["3Вор", "3BC", "三鸦"],
    desc: ["Три медвежьи свечи подряд с падением закрытий и короткими нижними тенями: устойчивое давление продавцов.", "Three bearish candles in a row with falling closes and short lower shadows: steady selling.", "连续三根阴线、收盘逐步走低且下影线短：卖压持续。"],
  },
  {
    id: "inside_up", bars: 3, bias: "bull", trend: -1, prio: 72,
    name: ["Три внутренних вверх", "Three inside up", "三内升"],
    short: ["3В↑", "3In↑", "内升"],
    desc: ["Бычье харами, подтверждённое третьей свечой, закрывшейся выше открытия первой: разворот вверх подтверждён.", "A bullish harami confirmed by a third candle that closes above the open of the first: the reversal up is confirmed.", "看涨孕线被第三根收于首根开盘价之上的K线确认：向上反转得到确认。"],
  },
  {
    id: "inside_down", bars: 3, bias: "bear", trend: 1, prio: 72,
    name: ["Три внутренних вниз", "Three inside down", "三内降"],
    short: ["3В↓", "3In↓", "内降"],
    desc: ["Медвежье харами, подтверждённое третьей свечой, закрывшейся ниже открытия первой: разворот вниз подтверждён.", "A bearish harami confirmed by a third candle that closes below the open of the first: the reversal down is confirmed.", "看跌孕线被第三根收于首根开盘价之下的K线确认：向下反转得到确认。"],
  },
  {
    id: "outside_up", bars: 3, bias: "bull", trend: -1, prio: 78,
    name: ["Три внешних вверх", "Three outside up", "三外升"],
    short: ["3Н↑", "3Out↑", "外升"],
    desc: ["Бычье поглощение, подтверждённое третьей свечой с более высоким закрытием: разворот вверх подтверждён.", "A bullish engulfing confirmed by a third candle with a higher close: the reversal up is confirmed.", "看涨吞没被收盘更高的第三根K线确认：向上反转得到确认。"],
  },
  {
    id: "outside_down", bars: 3, bias: "bear", trend: 1, prio: 78,
    name: ["Три внешних вниз", "Three outside down", "三外降"],
    short: ["3Н↓", "3Out↓", "外降"],
    desc: ["Медвежье поглощение, подтверждённое третьей свечой с более низким закрытием: разворот вниз подтверждён.", "A bearish engulfing confirmed by a third candle with a lower close: the reversal down is confirmed.", "看跌吞没被收盘更低的第三根K线确认：向下反转得到确认。"],
  },
  {
    id: "tasuki_up", bars: 3, bias: "bull", trend: 1, prio: 74,
    name: ["Разрыв тасуки вверх", "Upside Tasuki gap", "向上跳空并列阴阳线"],
    short: ["Тасуки↑", "Tasuki↑", "并列↑"],
    desc: ["Две бычьи свечи с разрывом вверх, затем медвежья открывается в теле второй и закрывается в разрыве, не закрыв его: окно устояло, рост продолжается.", "Two bullish candles with a gap up, then a bearish one opens inside the second body and closes in the gap without filling it: the window held, the rise goes on.", "两根阳线向上跳空，随后阴线在第二根实体内开盘并收于缺口内但未回补：窗口守住，涨势延续。"],
  },
  {
    id: "tasuki_down", bars: 3, bias: "bear", trend: -1, prio: 74,
    name: ["Разрыв тасуки вниз", "Downside Tasuki gap", "向下跳空并列阴阳线"],
    short: ["Тасуки↓", "Tasuki↓", "并列↓"],
    desc: ["Две медвежьи свечи с разрывом вниз, затем бычья открывается в теле второй и закрывается в разрыве, не закрыв его: окно устояло, снижение продолжается.", "Two bearish candles with a gap down, then a bullish one opens inside the second body and closes in the gap without filling it: the window held, the decline goes on.", "两根阴线向下跳空，随后阳线在第二根实体内开盘并收于缺口内但未回补：窗口守住，跌势延续。"],
  },
  {
    id: "sidebyside_bull", bars: 3, bias: "bull", trend: 1, prio: 73,
    name: ["Смежные белые свечи (разрыв вверх)", "Upside-gap side-by-side white lines", "向上跳空并列阳线"],
    short: ["Смеж↑", "SbS↑", "并阳↑"],
    desc: ["После разрыва вверх две бычьи свечи рядом, с почти одинаковым открытием и размером: покупатели удержали разрыв, рост продолжается.", "After a gap up two bullish candles stand side by side with about the same open and size: buyers held the gap, the rise goes on.", "向上跳空后两根开盘价与大小相近的阳线并列：多头守住缺口，涨势延续。"],
  },
  {
    id: "sidebyside_bear", bars: 3, bias: "bear", trend: -1, prio: 73,
    name: ["Смежные белые свечи (разрыв вниз)", "Downside-gap side-by-side white lines", "向下跳空并列阳线"],
    short: ["Смеж↓", "SbS↓", "并阳↓"],
    desc: ["После разрыва вниз две бычьи свечи рядом, с почти одинаковым открытием и размером, не закрыли разрыв: это лишь закрытие коротких позиций, снижение продолжается.", "After a gap down two bullish candles side by side, with about the same open and size, fail to fill the gap: only short covering, the decline goes on.", "向下跳空后两根开盘价与大小相近的阳线并列却未回补缺口：只是空头回补，跌势延续。"],
  },
  {
    id: "tristar_bull", bars: 3, bias: "bull", trend: -1, prio: 90,
    name: ["Три звезды (дно)", "Bullish tri-star", "看涨三星"],
    short: ["3Зв↑", "Tri↑", "三星↑"],
    desc: ["Три доджи подряд после снижения, средний ниже двух других: рынок выдохся, очень редкий сигнал разворота вверх.", "Three doji in a row after a decline, the middle one below the other two: the market is exhausted, a very rare reversal-up signal.", "下跌后连续三根十字星，中间一根低于另两根：市场衰竭，极罕见的向上反转信号。"],
  },
  {
    id: "tristar_bear", bars: 3, bias: "bear", trend: 1, prio: 90,
    name: ["Три звезды (вершина)", "Bearish tri-star", "看跌三星"],
    short: ["3Зв↓", "Tri↓", "三星↓"],
    desc: ["Три доджи подряд после роста, средний выше двух других: рынок выдохся, очень редкий сигнал разворота вниз.", "Three doji in a row after a rise, the middle one above the other two: the market is exhausted, a very rare reversal-down signal.", "上涨后连续三根十字星，中间一根高于另两根：市场衰竭，极罕见的向下反转信号。"],
  },
  {
    id: "advance_block", bars: 3, bias: "bear", trend: 1, prio: 81,
    name: ["Отбитое наступление", "Advance block", "前进受阻"],
    short: ["Отб", "AdvB", "受阻"],
    desc: ["Три бычьи свечи с ростом закрытий, но тела всё меньше, а верхние тени всё длиннее: наступление покупателей вязнет, возможен разворот вниз.", "Three bullish candles with rising closes, but the bodies shrink and the upper shadows grow: the advance is bogging down, a reversal down is possible.", "三根阳线收盘逐步抬高，但实体渐小、上影线渐长：多头进攻受阻，可能向下反转。"],
  },
  {
    id: "deliberation", bars: 3, bias: "bear", trend: 1, prio: 81,
    name: ["Торможение", "Deliberation (stalled pattern)", "停顿形态"],
    short: ["Торм", "Delib", "停顿"],
    desc: ["Две длинные бычьи свечи, за ними маленькая свеча или звезда у закрытия второй: рост затормозил, покупатели в раздумье, возможен разворот вниз.", "Two long bullish candles followed by a small candle or a star at the close of the second: the rise has stalled, buyers hesitate, a reversal down is possible.", "两根长阳线之后在第二根收盘价附近出现小K线或星线：涨势停顿，多头犹豫，可能向下反转。"],
  },
  {
    id: "two_crows", bars: 3, bias: "bear", trend: 1, prio: 82,
    name: ["Две вороны", "Two crows", "两只乌鸦"],
    short: ["2Вор", "2Crw", "双鸦"],
    desc: ["После длинной бычьей свечи медвежья с разрывом вверх, затем вторая медвежья открывается в её теле и закрывается в теле первой: разрыв закрыт, разворот вниз.", "After a long bullish candle a bearish one gaps up, then a second bearish one opens inside its body and closes inside the body of the first: the gap is filled, a reversal down.", "长阳线之后阴线向上跳空，随后第二根阴线在其实体内开盘并收于首根实体之内：缺口被回补，向下反转。"],
  },
  {
    id: "upgap_two_crows", bars: 3, bias: "bear", trend: 1, prio: 84,
    name: ["Две взлетевшие вороны", "Upside-gap two crows", "向上跳空两只乌鸦"],
    short: ["2Взл", "UG2C", "跳空双鸦"],
    desc: ["После длинной бычьей свечи маленькая медвежья с разрывом вверх, затем большая медвежья поглощает её, но закрывается всё ещё выше первой: рост теряет силу, возможен разворот вниз.", "After a long bullish candle a small bearish one gaps up, then a bigger bearish one engulfs it but still closes above the first: the rise is losing strength, a reversal down is possible.", "长阳线之后小阴线向上跳空，随后更大的阴线将其吞没但仍收于首根之上：涨势转弱，可能向下反转。"],
  },
  {
    id: "three_river", bars: 3, bias: "bull", trend: -1, prio: 83,
    name: ["Уникальное дно трёх рек", "Unique three-river bottom", "奇特三川底"],
    short: ["3Реки", "3Riv", "三川底"],
    desc: ["Длинная медвежья свеча, затем медвежье харами с длинной нижней тенью и новым минимумом, затем маленькая бычья свеча ниже закрытия второй: дно нащупано, редкий сигнал разворота вверх.", "A long bearish candle, a bearish harami with a long lower shadow and a new low, then a small bullish candle below the close of the second: the bottom is found, a rare reversal-up signal.", "长阴线、带长下影并创新低的阴线孕线、再一根收于第二根收盘价之下的小阳线：底部探明，罕见的向上反转信号。"],
  },
  {
    id: "stick_sandwich", bars: 3, bias: "bull", trend: -1, prio: 68,
    name: ["Сэндвич (бычий)", "Bullish stick sandwich", "看涨条形三明治"],
    short: ["Сэндв↑", "Sandw↑", "三明治↑"],
    desc: ["Бычья свеча между двумя медвежьими с одинаковым закрытием после снижения: уровень закрытия дважды устоял и стал поддержкой, возможен разворот вверх.", "A bullish candle between two bearish ones with the same close after a decline: the closing level held twice and became support, a reversal up is possible.", "下跌后一根阳线夹在两根收盘价相同的阴线之间：该收盘价两度守住成为支撑，可能向上反转。"],
  },
  {
    id: "stick_sandwich_bear", bars: 3, bias: "bear", trend: 1, prio: 68,
    name: ["Сэндвич (медвежий)", "Bearish stick sandwich", "看跌条形三明治"],
    short: ["Сэндв↓", "Sandw↓", "三明治↓"],
    desc: ["Медвежья свеча между двумя бычьими с одинаковым закрытием после роста: уровень закрытия дважды не был пройден и стал сопротивлением, возможен разворот вниз.", "A bearish candle between two bullish ones with the same close after a rise: the closing level capped the price twice and became resistance, a reversal down is possible.", "上涨后一根阴线夹在两根收盘价相同的阳线之间：该收盘价两度未被突破成为阻力，可能向下反转。"],
  },

  /* ───── four candles ───── */
  {
    id: "strike_bull", bars: 4, bias: "bull", trend: 1, prio: 90, absorbs: ["soldiers"],
    name: ["Три линейных удара (бычьи)", "Bullish three-line strike", "看涨三线打击"],
    short: ["3Уд↑", "3LS↑", "三线↑"],
    desc: ["Три бычьи свечи с ростом закрытий, затем одна медвежья открывается выше и закрывается ниже открытия первой: разовая фиксация прибыли, восходящий тренд обычно возобновляется.", "Three bullish candles with rising closes, then one bearish candle opens higher and closes below the open of the first: one-off profit taking, the uptrend usually resumes.", "三根收盘逐步抬高的阳线之后，一根阴线高开并收于首根开盘价之下：一次性获利了结，上升趋势通常恢复。"],
  },
  {
    id: "strike_bear", bars: 4, bias: "bear", trend: -1, prio: 90, absorbs: ["crows"],
    name: ["Три линейных удара (медвежьи)", "Bearish three-line strike", "看跌三线打击"],
    short: ["3Уд↓", "3LS↓", "三线↓"],
    desc: ["Три медвежьи свечи с падением закрытий, затем одна бычья открывается ниже и закрывается выше открытия первой: разовое закрытие коротких позиций, нисходящий тренд обычно возобновляется.", "Three bearish candles with falling closes, then one bullish candle opens lower and closes above the open of the first: one-off short covering, the downtrend usually resumes.", "三根收盘逐步走低的阴线之后，一根阳线低开并收于首根开盘价之上：一次性空头回补，下降趋势通常恢复。"],
  },
  {
    id: "concealing_swallow", bars: 4, bias: "bull", trend: -1, prio: 93,
    name: ["Сокрытие ласточки", "Concealing baby swallow", "藏婴吞没"],
    short: ["Ласт", "CBS", "藏婴"],
    desc: ["Два медвежьих марубозу, третья медвежья свеча с разрывом вниз и длинной верхней тенью в теле второй, четвёртая поглощает третью вместе с тенями: продавцы исчерпаны, очень редкий сигнал разворота вверх.", "Two bearish marubozu, a third bearish candle gapping down with a long upper shadow into the second body, a fourth one engulfing the third with its shadows: sellers are spent, a very rare reversal-up signal.", "两根光头光脚阴线，第三根阴线向下跳空且长上影伸入第二根实体，第四根将第三根连同影线一并吞没：空头力竭，极罕见的向上反转信号。"],
  },

  /* ───── five candles ───── */
  {
    id: "rising3", bars: 5, span: [4, 7], bias: "bull", trend: 1, prio: 75,
    name: ["Три метода вверх", "Rising three methods", "上升三法"],
    short: ["3М↑", "R3M", "上三法"],
    desc: ["Длинная бычья свеча, от двух до пяти (обычно три) маленьких свечей внутри её диапазона и новая длинная бычья свеча с закрытием выше первой: пауза в восходящем тренде, он продолжается.", "A long bullish candle, two to five (usually three) small candles inside its range and a new long bullish candle closing above the first: a pause in an uptrend that goes on.", "长阳线、其区间内二至五根（通常三根）小K线、再一根收盘高于首根的长阳线：上升趋势中的停歇，趋势延续。"],
  },
  {
    id: "falling3", bars: 5, span: [4, 7], bias: "bear", trend: -1, prio: 75,
    name: ["Три метода вниз", "Falling three methods", "下降三法"],
    short: ["3М↓", "F3M", "下三法"],
    desc: ["Длинная медвежья свеча, от двух до пяти (обычно три) маленьких свечей внутри её диапазона и новая длинная медвежья свеча с закрытием ниже первой: пауза в нисходящем тренде, он продолжается.", "A long bearish candle, two to five (usually three) small candles inside its range and a new long bearish candle closing below the first: a pause in a downtrend that goes on.", "长阴线、其区间内二至五根（通常三根）小K线、再一根收盘低于首根的长阴线：下降趋势中的停歇，趋势延续。"],
  },
  {
    id: "mathold", bars: 5, bias: "bull", trend: 1, prio: 87,
    name: ["Удержание на татами (бычье)", "Bullish mat hold", "看涨铺垫形态"],
    short: ["Татами↑", "MatH↑", "铺垫↑"],
    desc: ["Длинная бычья свеча, маленькая свеча с разрывом вверх, ещё две маленькие с небольшим снижением выше открытия первой и новая бычья свеча выше их максимумов: покупатели удержали позиции, рост продолжается.", "A long bullish candle, a small candle gapping up, two more small ones drifting lower but above the open of the first, and a new bullish candle above their highs: buyers held their ground, the rise goes on.", "长阳线、向上跳空的小K线、再两根小幅回落但高于首根开盘价的小K线、最后一根高于它们最高价的阳线：多头守住阵地，涨势延续。"],
  },
  {
    id: "mathold_bear", bars: 5, bias: "bear", trend: -1, prio: 87,
    name: ["Удержание на татами (медвежье)", "Bearish mat hold", "看跌铺垫形态"],
    short: ["Татами↓", "MatH↓", "铺垫↓"],
    desc: ["Длинная медвежья свеча, маленькая свеча с разрывом вниз, ещё две маленькие с небольшим подъёмом ниже открытия первой и новая медвежья свеча ниже их минимумов: продавцы удержали позиции, снижение продолжается.", "A long bearish candle, a small candle gapping down, two more small ones drifting higher but below the open of the first, and a new bearish candle below their lows: sellers held their ground, the decline goes on.", "长阴线、向下跳空的小K线、再两根小幅回升但低于首根开盘价的小K线、最后一根低于它们最低价的阴线：空头守住阵地，跌势延续。"],
  },
  {
    id: "ladder_bottom", bars: 5, bias: "bull", trend: -1, prio: 86,
    name: ["Дно-лестница", "Ladder bottom", "梯形底部"],
    short: ["Лестн", "Ladder", "梯底"],
    desc: ["Три медвежьи свечи ступенями вниз, четвёртая медвежья с заметной верхней тенью, пятая бычья открывается выше её тела и закрывается выше её максимума: продавцы выдохлись, разворот вверх.", "Three bearish candles stepping down, a fourth bearish one with a marked upper shadow, a fifth bullish one opening above its body and closing above its high: sellers are spent, a reversal up.", "三根阴线阶梯式下行，第四根阴线带明显上影线，第五根阳线开于其实体之上并收于其最高价之上：空头力竭，向上反转。"],
  },
  {
    id: "breakaway_bull", bars: 5, bias: "bull", trend: -1, prio: 89,
    name: ["Бычий отрыв", "Bullish breakaway", "看涨脱离"],
    short: ["Отрыв↑", "Brk↑", "脱离↑"],
    desc: ["Длинная медвежья свеча, разрыв вниз, ещё три свечи со всё более низкими закрытиями и длинная бычья свеча с закрытием внутри разрыва: падение перегрето, разворот вверх.", "A long bearish candle, a gap down, three more candles with lower and lower closes and a long bullish candle closing inside the gap: the fall is overdone, a reversal up.", "长阴线、向下跳空、再三根收盘逐步走低的K线，最后一根长阳线收于缺口之内：跌势过度，向上反转。"],
  },
  {
    id: "breakaway_bear", bars: 5, bias: "bear", trend: 1, prio: 89,
    name: ["Медвежий отрыв", "Bearish breakaway", "看跌脱离"],
    short: ["Отрыв↓", "Brk↓", "脱离↓"],
    desc: ["Длинная бычья свеча, разрыв вверх, ещё три свечи со всё более высокими закрытиями и длинная медвежья свеча с закрытием внутри разрыва: рост перегрет, разворот вниз.", "A long bullish candle, a gap up, three more candles with higher and higher closes and a long bearish candle closing inside the gap: the rise is overdone, a reversal down.", "长阳线、向上跳空、再三根收盘逐步抬高的K线，最后一根长阴线收于缺口之内：涨势过度，向下反转。"],
  },
  {
    id: "island_top", bars: 5, span: [3, 7], bias: "bear", trend: 1, prio: 91,
    name: ["Островной разворот (вершина)", "Island reversal top", "顶部岛形反转"],
    short: ["Остров↓", "Isl↓", "岛顶"],
    desc: ["После роста группа из одной - пяти свечей отделена ценовыми разрывами с обеих сторон: вверх перед ней и вниз после неё. Покупатели наверху остались в ловушке, сильный сигнал разворота вниз.", "After a rise a group of one to five candles is cut off by price gaps on both sides: up before it and down after it. Buyers at the top are trapped, a strong reversal-down signal.", "上涨后一至五根K线两侧均被跳空隔开：之前向上跳空、之后向下跳空。高位多头被套，强烈的向下反转信号。"],
  },
  {
    id: "island_bottom", bars: 5, span: [3, 7], bias: "bull", trend: -1, prio: 91,
    name: ["Островной разворот (дно)", "Island reversal bottom", "底部岛形反转"],
    short: ["Остров↑", "Isl↑", "岛底"],
    desc: ["После снижения группа из одной - пяти свечей отделена ценовыми разрывами с обеих сторон: вниз перед ней и вверх после неё. Продавцы внизу остались в ловушке, сильный сигнал разворота вверх.", "After a decline a group of one to five candles is cut off by price gaps on both sides: down before it and up after it. Sellers at the bottom are trapped, a strong reversal-up signal.", "下跌后一至五根K线两侧均被跳空隔开：之前向下跳空、之后向上跳空。低位空头被套，强烈的向上反转信号。"],
  },
];

export const CANDLE_IDS: CandleId[] = CANDLE_META.map((m) => m.id);
export const CANDLE_BY_ID: Record<string, CandleMeta> = Object.fromEntries(CANDLE_META.map((m) => [m.id, m]));
export const MAIN_IDS: CandleId[] = CANDLE_META.filter((m) => m.main).map((m) => m.id);

/** The «not a guarantee» note that goes under every description. */
export const CANDLE_DISCLAIMER: Tri = [
  "Свечные паттерны - вероятностный сигнал, а не гарантия: подтверждайте уровнями, объёмом и контекстом.",
  "Candlestick patterns are a probabilistic hint, not a guarantee: confirm with levels, volume and context.",
  "K线形态只是概率性提示，并非保证：请结合价位、成交量与背景确认。",
];
