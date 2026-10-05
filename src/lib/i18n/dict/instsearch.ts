import type { SectionDict } from "./types";
import { US_FUTURES } from "../../us-futures";

// Instrument search dialog (watchlist «Добавить инструмент», symbol search, compare): title, filters, futures asset chips, hints; names of the US futures.
// Rows are [key, ru, en, cn].
const rows: [string, string, string, string][] = [
  ["is.title.watchlist", "Добавить инструмент", "Add symbol", "添加品种"],
  ["is.title.symbol", "Поиск символа", "Symbol search", "搜索品种"],
  ["is.title.compare", "Сравнить с", "Compare with", "对比"],
  ["is.placeholder", "Ищите по инструменту, названию, тикеру или ISIN", "Search by symbol, name, ticker or ISIN", "按品种、名称、代码或 ISIN 搜索"],
  ["is.chips", "Категории инструментов", "Instrument categories", "品种类别"],
  ["is.assets", "Базовый актив фьючерса", "Futures underlying asset", "期货标的资产"],
  ["is.filters", "Фильтры", "Filters", "筛选"],
  // dropdown filters («Все ...» is the first option of each)
  ["is.filter.country", "Все страны", "All countries", "所有国家"],
  ["is.filter.exchange", "Все биржи", "All exchanges", "所有交易所"],
  ["is.filter.board", "Все режимы торгов", "All boards", "所有交易板块"],
  ["is.filter.category", "Все категории", "All categories", "所有类别"],
  ["is.filter.quote", "Все валюты котировки", "All quote currencies", "所有计价货币"],
  ["is.country.RU", "Россия", "Russia", "俄罗斯"],
  ["is.country.US", "США", "USA", "美国"],
  ["is.sub.RU", "MOEX · срочный рынок FORTS", "MOEX · FORTS derivatives", "MOEX · FORTS 衍生品市场"],
  ["is.sub.US", "CME Group, ICE US · данные FMP", "CME Group, ICE US · FMP data", "CME Group、ICE US · FMP 数据"],
  // category / board / quote values of the second dropdown
  ["is.cat.major", "Основные пары", "Majors", "主要货币对"],
  ["is.cat.cross", "Кроссы", "Crosses", "交叉盘"],
  ["is.cat.em", "Развивающиеся рынки", "Emerging markets", "新兴市场"],
  ["is.cat.metal", "Металлы", "Metals", "贵金属"],
  ["is.cat.equity", "Акции", "Equity", "股票指数"],
  ["is.cat.bond", "Облигации", "Bonds", "债券"],
  ["is.cat.tr", "Полной доходности", "Total return", "全收益"],
  ["is.cat.ofz", "ОФЗ", "Government (OFZ)", "联邦债券 (OFZ)"],
  ["is.cat.corp", "Корпоративные", "Corporate", "公司债券"],
  ["is.cat.fiat", "Валюты", "Currencies", "货币"],
  ["is.board.TQBR", "TQBR · Т+ акции и ДР", "TQBR · T+ shares and DRs", "TQBR · T+ 股票和存托凭证"],
  ["is.board.TQTF", "TQTF · Т+ ETF", "TQTF · T+ ETFs", "TQTF · T+ ETF"],
  ["is.board.TQTD", "TQTD · Т+ ETF (USD)", "TQTD · T+ ETFs (USD)", "TQTD · T+ ETF (美元)"],
  ["is.board.TQIF", "TQIF · Т+ ПИФ", "TQIF · T+ mutual funds", "TQIF · T+ 共同基金"],
  ["is.board.CETS", "CETS · валютный рынок", "CETS · FX market", "CETS · 外汇市场"],
  // futures asset chips (the second row of the «Фьючерсы» chip) and the headers of the groups
  ["is.fa.all", "Все", "All", "全部"],
  ["is.fa.oil", "Нефть", "Oil", "原油"],
  ["is.fa.gas", "Газ", "Gas", "天然气"],
  ["is.fa.gold", "Золото", "Gold", "黄金"],
  ["is.fa.silver", "Серебро", "Silver", "白银"],
  ["is.fa.copper", "Медь", "Copper", "铜"],
  ["is.fa.platinum", "Платина", "Platinum", "铂金"],
  ["is.fa.palladium", "Палладий", "Palladium", "钯金"],
  ["is.fa.index", "Индексы", "Indices", "指数"],
  ["is.fa.currency", "Валюты", "Currencies", "货币"],
  ["is.fa.bond", "Облигации", "Bonds", "债券"],
  ["is.fa.grain", "Зерновые", "Grains", "谷物"],
  ["is.fa.soft", "Мягкие", "Softs", "软商品"],
  ["is.fa.livestock", "Скот", "Livestock", "畜牧"],
  ["is.fa.crypto", "Крипто", "Crypto", "加密"],
  ["is.fa.stock", "Акции", "Stocks", "股票"],
  ["is.fa.other", "Прочее", "Other", "其他"],
  ["is.fah.oil", "Нефть и нефтепродукты", "Oil and refined products", "原油及成品油"],
  ["is.fah.gas", "Газ", "Natural gas", "天然气"],
  ["is.fah.gold", "Золото", "Gold", "黄金"],
  ["is.fah.silver", "Серебро", "Silver", "白银"],
  ["is.fah.copper", "Медь и цветные металлы", "Copper and base metals", "铜及有色金属"],
  ["is.fah.platinum", "Платина", "Platinum", "铂金"],
  ["is.fah.palladium", "Палладий", "Palladium", "钯金"],
  ["is.fah.index", "Индексы", "Indices", "指数"],
  ["is.fah.currency", "Валюты", "Currencies", "货币"],
  ["is.fah.bond", "Облигации и ставки", "Bonds and rates", "债券与利率"],
  ["is.fah.grain", "Зерновые и масличные", "Grains and oilseeds", "谷物与油籽"],
  ["is.fah.soft", "Мягкие товары", "Softs", "软商品"],
  ["is.fah.livestock", "Скот и молочная продукция", "Livestock and dairy", "畜牧与乳制品"],
  ["is.fah.crypto", "Криптовалюты", "Crypto", "加密货币"],
  ["is.fah.stock", "Акции", "Single stocks", "个股"],
  ["is.fah.other", "Прочее", "Other", "其他"],
  // list
  ["is.recent", "Недавние", "Recent", "最近使用"],
  ["is.more", "Показать ещё", "Show more", "显示更多"],
  ["is.moreN", "Показать ещё ({n})", "Show more ({n})", "显示更多（{n}）"],
  ["is.empty", "Ничего не найдено", "Nothing found", "未找到结果"],
  ["is.emptyHint", "Измените запрос или фильтры", "Change the query or the filters", "请更改搜索词或筛选条件"],
  ["is.reset", "Сбросить фильтры", "Reset filters", "重置筛选"],
  ["is.failed", "Не удалось загрузить список. Проверьте соединение", "Could not load the list. Check the connection", "无法加载列表，请检查网络连接"],
  ["is.retry", "Повторить", "Retry", "重试"],
  ["is.results", "Найдено: {n}", "{n} results", "找到 {n} 个结果"],
  ["is.add", "Добавить {ticker} в список", "Add {ticker} to the list", "将 {ticker} 加入列表"],
  ["is.remove", "Убрать {ticker} из списка", "Remove {ticker} from the list", "将 {ticker} 从列表移除"],
  ["is.inList", "{ticker}: уже в списке", "{ticker}: already in the list", "{ticker}：已在列表中"],
  ["is.src.fmp", "Данные FMP: непрерывная серия ближайшего контракта", "FMP data: continuous front-month series", "FMP 数据：近月连续合约"],
  ["is.hint.watchlist", "Shift + Клик или Shift + Enter — добавить инструмент и закрыть диалоговое окно", "Shift + Click or Shift + Enter to add the symbol and close the dialog", "Shift + 点击或 Shift + Enter：添加品种并关闭对话框"],
  ["is.hint.pick", "↑↓ — выбрать, Enter — открыть, → — контракты, Esc — закрыть", "↑↓ to move, Enter to open, → for contracts, Esc to close", "↑↓ 选择，Enter 打开，→ 合约，Esc 关闭"],
];

const dict: SectionDict = { ru: {}, en: {}, cn: {} };
for (const [key, ru, en, cn] of rows) {
  dict.ru[key] = ru;
  dict.en[key] = en;
  dict.cn[key] = cn;
}
// names of the US futures in the watchlist / info card (the Chinese UI shows the exchange's English name)
for (const f of US_FUTURES) {
  dict.ru[`instname.${f.symbol}`] = f.ru;
  dict.en[`instname.${f.symbol}`] = f.en;
  dict.cn[`instname.${f.symbol}`] = f.en;
}

export default dict;
