import type { SectionDict } from "./types";

// Futures contract picker, market search tabs. Rows are [key, ru, en, cn].
const rows: [string, string, string, string][] = [
  ["ct.title", "Контракт", "Contract", "合约"],
  ["ct.pick", "Выбрать контракт", "Choose contract", "选择合约"],
  ["ct.auto", "Авто (текущий)", "Auto (front month)", "自动 (当前合约)"],
  ["ct.autoHint", "Всегда ближайший контракт, переключается сам при экспирации", "Always the nearest contract, rolls over by itself at expiry", "始终为最近月合约，到期时自动切换"],
  ["ct.loading", "Загрузка контрактов…", "Loading contracts…", "正在加载合约…"],
  ["ct.unavailable", "Список контрактов недоступен", "Contract list is unavailable", "合约列表不可用"],
  ["ct.expires", "экспирация {date}", "expires {date}", "到期 {date}"],
  ["ct.left", "{n} дн.", "{n} d", "{n}天"],
  ["ct.noExpiry", "без экспирации", "no expiry", "无到期日"],
  ["ct.last", "последний выбор", "last used", "上次选择"],
  ["ct.spot", "Спот", "Spot", "现货"],
  ["ct.roll.warn", "экспирация через {n} дн.", "expires in {n} d", "{n}天后到期"],
  ["ct.roll.today", "экспирация сегодня", "expires today", "今日到期"],
  ["ct.roll.to", "Перейти на {ticker}", "Switch to {ticker}", "切换到 {ticker}"],
  ["ct.roll.title", "Контракт скоро экспирируется: перейти на следующий", "The contract expires soon: switch to the next one", "合约即将到期：切换到下一个"],
  ["ct.b.current", "текущий", "current", "当前"],
  ["ct.b.next", "следующий", "next", "次月"],
  ["ct.b.nth", "{n}-й", "#{n}", "第{n}个"],
  ["ct.contracts", "{n} контр.", "{n} contracts", "{n} 个合约"],
  ["ct.expand", "Показать контракты", "Show contracts", "显示合约"],
  ["ct.collapse", "Скрыть контракты", "Hide contracts", "隐藏合约"],
  ["ct.autoRow", "Авто (текущий)", "Auto (front)", "自动 (当前)"],
  ["ms.tab.all", "Все", "All", "全部"],
  ["ms.tab.stock", "Акции", "Stocks", "股票"],
  ["ms.tab.bond", "Облигации", "Bonds", "债券"],
  ["ms.tab.fund", "Фонды", "Funds", "基金"],
  ["ms.tab.future", "Фьючерсы", "Futures", "期货"],
  ["ms.tab.currency", "Валюта", "Currency", "外汇"],
  ["ms.tab.index", "Индексы", "Indices", "指数"],
  ["ms.group.terminal", "Терминал", "Terminal", "终端"],
  ["ms.group.stock", "Акции", "Stocks", "股票"],
  ["ms.group.bond", "Облигации", "Bonds", "债券"],
  ["ms.group.fund", "Фонды", "Funds", "基金"],
  ["ms.group.future", "Фьючерсы", "Futures", "期货"],
  ["ms.group.currency", "Валюта", "Currency", "外汇"],
  ["ms.group.index", "Индексы", "Indices", "指数"],
  ["ms.searching", "Поиск по бирже…", "Searching the exchange…", "正在搜索交易所…"],
  ["ms.unitPct", "% от номинала", "% of par", "占面值 %"],
  ["ms.perpetual", "вечный", "perpetual", "永续"],
  ["ms.futures", "фьючерс", "futures", "期货"],
];

const dict: SectionDict = { ru: {}, en: {}, cn: {} };
for (const [key, ru, en, cn] of rows) {
  dict.ru[key] = ru;
  dict.en[key] = en;
  dict.cn[key] = cn;
}

export default dict;
