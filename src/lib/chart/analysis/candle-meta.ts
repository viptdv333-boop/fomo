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
  | "rising3" | "falling3";

export type CandleBias = "bull" | "bear" | "flat";
export type Tri = [string, string, string];

export interface CandleMeta {
  id: CandleId;
  /** Candles in the pattern (the marker sits on the last one). */
  bars: 1 | 2 | 3 | 5;
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
    desc: ["Две свечи с одинаковыми минимумами после снижения: уровень выдержал повторный тест, возможен разворот вверх.", "Two candles with equal lows after a decline: the level held a second test, a reversal up is possible.", "下跌后两根K线最低价相同：该位置经受住再次测试，可能向上反转。"],
  },
  {
    id: "tweezer_top", bars: 2, bias: "bear", trend: 1, prio: 46,
    name: ["Пинцет (вершина)", "Tweezer top", "平头顶部"],
    short: ["Пинц↓", "Tw↓", "平顶"],
    desc: ["Две свечи с одинаковыми максимумами после роста: уровень отразил повторную атаку, возможен разворот вниз.", "Two candles with equal highs after a rise: the level repelled a second attack, a reversal down is possible.", "上涨后两根K线最高价相同：该位置挡住再次冲击，可能向下反转。"],
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

  /* ───── five candles ───── */
  {
    id: "rising3", bars: 5, bias: "bull", trend: 1, prio: 75,
    name: ["Три метода вверх", "Rising three methods", "上升三法"],
    short: ["3М↑", "R3M", "上三法"],
    desc: ["Длинная бычья свеча, три маленькие свечи внутри её диапазона и новая длинная бычья свеча выше: пауза в восходящем тренде, он продолжается.", "A long bullish candle, three small candles inside its range and a new long bullish candle above: a pause in an uptrend that goes on.", "长阳线、其区间内三根小K线、再一根更高的长阳线：上升趋势中的停歇，趋势延续。"],
  },
  {
    id: "falling3", bars: 5, bias: "bear", trend: -1, prio: 75,
    name: ["Три метода вниз", "Falling three methods", "下降三法"],
    short: ["3М↓", "F3M", "下三法"],
    desc: ["Длинная медвежья свеча, три маленькие свечи внутри её диапазона и новая длинная медвежья свеча ниже: пауза в нисходящем тренде, он продолжается.", "A long bearish candle, three small candles inside its range and a new long bearish candle below: a pause in a downtrend that goes on.", "长阴线、其区间内三根小K线、再一根更低的长阴线：下降趋势中的停歇，趋势延续。"],
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
