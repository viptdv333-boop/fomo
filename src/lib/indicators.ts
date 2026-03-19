export interface Bar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export function calcSMA(data: Bar[], period: number): { time: number; value: number }[] {
  const result: { time: number; value: number }[] = [];
  for (let i = period - 1; i < data.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) sum += data[i - j].close;
    result.push({ time: data[i].time, value: sum / period });
  }
  return result;
}

export function calcEMA(data: Bar[], period: number): { time: number; value: number }[] {
  if (data.length < period) return [];
  const k = 2 / (period + 1);
  const result: { time: number; value: number }[] = [];
  let sum = 0;
  for (let i = 0; i < period; i++) sum += data[i].close;
  let ema = sum / period;
  result.push({ time: data[period - 1].time, value: ema });
  for (let i = period; i < data.length; i++) {
    ema = data[i].close * k + ema * (1 - k);
    result.push({ time: data[i].time, value: ema });
  }
  return result;
}

export function calcBOLL(data: Bar[], period = 20, mult = 2) {
  const upper: { time: number; value: number }[] = [];
  const middle: { time: number; value: number }[] = [];
  const lower: { time: number; value: number }[] = [];
  for (let i = period - 1; i < data.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) sum += data[i - j].close;
    const avg = sum / period;
    let sqSum = 0;
    for (let j = 0; j < period; j++) sqSum += (data[i - j].close - avg) ** 2;
    const std = Math.sqrt(sqSum / period);
    middle.push({ time: data[i].time, value: avg });
    upper.push({ time: data[i].time, value: avg + mult * std });
    lower.push({ time: data[i].time, value: avg - mult * std });
  }
  return { upper, middle, lower };
}

export function calcRSI(data: Bar[], period = 14): { time: number; value: number }[] {
  if (data.length < period + 1) return [];
  const result: { time: number; value: number }[] = [];
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = data[i].close - data[i - 1].close;
    if (diff > 0) avgGain += diff;
    else avgLoss -= diff;
  }
  avgGain /= period;
  avgLoss /= period;
  result.push({
    time: data[period].time,
    value: 100 - 100 / (1 + (avgLoss === 0 ? 100 : avgGain / avgLoss)),
  });
  for (let i = period + 1; i < data.length; i++) {
    const diff = data[i].close - data[i - 1].close;
    avgGain = (avgGain * (period - 1) + (diff > 0 ? diff : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (diff < 0 ? -diff : 0)) / period;
    result.push({
      time: data[i].time,
      value: 100 - 100 / (1 + (avgLoss === 0 ? 100 : avgGain / avgLoss)),
    });
  }
  return result;
}

export function calcMACD(data: Bar[], fast = 12, slow = 26, signal = 9) {
  const emaFast = calcEMA(data, fast);
  const emaSlow = calcEMA(data, slow);
  const offset = slow - fast;
  const macdLine: { time: number; value: number }[] = [];
  for (let i = 0; i < emaSlow.length; i++) {
    macdLine.push({
      time: emaSlow[i].time,
      value: emaFast[i + offset].value - emaSlow[i].value,
    });
  }
  if (macdLine.length < signal)
    return { macd: [], signal: [], histogram: [] as { time: number; value: number; color: string }[] };

  const k = 2 / (signal + 1);
  let sigEma = 0;
  for (let i = 0; i < signal; i++) sigEma += macdLine[i].value;
  sigEma /= signal;

  const sigLine = [{ time: macdLine[signal - 1].time, value: sigEma }];
  const hist = [
    {
      time: macdLine[signal - 1].time,
      value: macdLine[signal - 1].value - sigEma,
      color: macdLine[signal - 1].value - sigEma >= 0 ? "#22c55e" : "#ef4444",
    },
  ];

  for (let i = signal; i < macdLine.length; i++) {
    sigEma = macdLine[i].value * k + sigEma * (1 - k);
    sigLine.push({ time: macdLine[i].time, value: sigEma });
    const h = macdLine[i].value - sigEma;
    hist.push({ time: macdLine[i].time, value: h, color: h >= 0 ? "#22c55e" : "#ef4444" });
  }

  return { macd: macdLine.slice(signal - 1), signal: sigLine, histogram: hist };
}
