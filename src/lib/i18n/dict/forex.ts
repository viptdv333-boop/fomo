import type { SectionDict } from "./types";
import { FX_PAIRS, fxName } from "../../forex-meta";

// Forex (international currency pairs) in the terminal: tab / group names, chart hints, pair names. Rows are [key, ru, en, cn].
const rows: [string, string, string, string][] = [
  ["terminal.forex", "Форекс", "Forex", "国际外汇"],
  ["ms.tab.forex", "Форекс", "Forex", "国际外汇"],
  ["ms.group.forex", "Форекс", "Forex", "国际外汇"],
  ["fx.badge.none", "FX · без объёма", "FX · no volume", "外汇 · 无成交量"],
  ["fx.badge.tick", "FX · тиковый объём", "FX · tick volume", "外汇 · 跳动量"],
  ["fx.badge.fut", "FX · объём фьючерса", "FX · futures volume", "外汇 · 期货成交量"],
  ["fx.vol.fut", "реальный объём фьючерса COMEX (не спота)", "real volume of the COMEX futures contract (not spot)", "COMEX 期货真实成交量（非现货）"],
  ["fx.vol.none", "отсутствует", "not available", "无"],
  ["fx.vol.tick", "тиковый (число котировок, не биржевой)", "tick count (not exchange volume)", "跳动数（非交易所成交量）"],
  [
    "fx.tip",
    "Спот-валюта: единой биржи нет, объём — {volume}. Торги 24x5 (вс 21:00 — пт 21:00 UTC). Источник: {provider}, котировки могут запаздывать.",
    "Spot FX: there is no central exchange, volume: {volume}. Trading 24x5 (Sun 21:00 - Fri 21:00 UTC). Source: {provider}, quotes may lag.",
    "现货外汇：没有统一交易所，成交量：{volume}。24x5 交易（周日 21:00 至周五 21:00 UTC）。数据源：{provider}，报价可能有延迟。",
  ],
  [
    "fx.proxy",
    "Спот металла недоступен: показан фьючерс {proxy}, цена может отличаться от спота.",
    "Spot metal is not available: showing {proxy}, the price may differ from spot.",
    "无现货金属报价：显示 {proxy}，价格可能与现货不同。",
  ],
  ["fx.noData", "Нет данных по паре: провайдер котировок не ответил", "No data for this pair: the quote provider did not answer", "暂无该货币对数据：报价源无响应"],
];

for (const p of FX_PAIRS) rows.push([`instname.${p.symbol}`, fxName(p, "ru"), fxName(p, "en"), fxName(p, "cn")]);

const dict: SectionDict = { ru: {}, en: {}, cn: {} };
for (const [key, ru, en, cn] of rows) {
  dict.ru[key] = ru;
  dict.en[key] = en;
  dict.cn[key] = cn;
}

export default dict;
