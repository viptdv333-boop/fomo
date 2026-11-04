import type { SectionDict } from "./types";

// Data providers: the keys a user pastes to get market data on his own account. Rows are [key, ru, en, cn].
const rows: [string, string, string, string][] = [
  ["nav.dataProviders", "Провайдеры данных", "Data providers", "数据提供商"],
  ["seo.dataproviders.title", "Провайдеры данных — FOMO Terminal", "Data providers — FOMO Terminal", "数据提供商 — FOMO Terminal"],
  ["dp.title", "Провайдеры данных", "Data providers", "数据提供商"],
  ["dp.lead", "Подключите данные на свой аккаунт: выберите провайдера рынка, вставьте ключ, и терминал получает данные напрямую от него. Ключ хранится зашифрованным и не возвращается в браузер.", "Connect market data on your own account: pick the provider of a market, paste a key and the terminal gets the data from it. The key is stored encrypted and never returned to the browser.", "在您自己的账户上连接行情数据：选择市场的提供商并粘贴密钥，终端即直接从其获取数据。密钥加密存储，不会返回浏览器。"],
  ["dp.market.moex", "МосБиржа", "Moscow Exchange", "莫斯科交易所"],
  ["dp.market.crypto", "Криптовалюты", "Crypto", "加密货币"],
  ["dp.market.world", "Мировые рынки", "World markets", "全球市场"],
  ["dp.market.world.sub", "Акции, индексы, ETF, форекс, криптовалюты", "Stocks, indices, ETFs, forex, crypto", "股票、指数、ETF、外汇、加密货币"],
  ["dp.market.us", "Американский рынок", "US market", "美国市场"],
  ["dp.market.us.sub", "Акции, ETF, фонды, опционы, фьючерсы CME и ICE", "Stocks, ETFs, funds, options, CME and ICE futures", "股票、ETF、基金、期权、CME 与 ICE 期货"],
  ["dp.g.live", "Данные в реальном времени", "Real-time data", "实时数据"],
  ["dp.g.trades", "Сделки по тикам", "Tick trades", "逐笔成交"],
  ["dp.g.depth", "Стакан", "Order book", "盘口深度"],
  ["dp.g.futoi", "Открытый интерес FUTOI, суперсвечи, алерты", "FUTOI open interest, supercandles, alerts", "FUTOI 持仓、超级K线、预警"],
  ["dp.g.oi", "Открытый интерес и ставки", "Open interest and funding", "持仓量与资金费率"],
  ["dp.g.seconds", "Секундные бары", "Second bars", "秒级K线"],
  ["dp.g.world", "Свечи и цены по всему миру", "Candles and prices worldwide", "全球K线与价格"],
  ["dp.g.futures", "Фьючерсы, акции и опционы США", "US futures, stocks and options", "美国期货、股票与期权"],
  ["dp.noKey", "Ключ не нужен: данные открытые", "No key needed: the data is public", "无需密钥：数据公开"],
  ["dp.connected", "Подключено", "Connected", "已连接"],
  ["dp.keyPh", "Вставьте ключ", "Paste the key", "粘贴密钥"],
  ["dp.save", "Проверить и сохранить", "Check and save", "验证并保存"],
  ["dp.replace", "Заменить ключ", "Replace the key", "更换密钥"],
  ["dp.remove", "Удалить ключ", "Remove the key", "删除密钥"],
  ["dp.removeSure", "Точно удалить?", "Really remove?", "确定删除？"],
  ["dp.getKey", "Где взять ключ", "Where to get a key", "在哪里获取密钥"],
  ["dp.saved", "Ключ принят и сохранён", "The key is accepted and saved", "密钥已接受并保存"],
  ["dp.onAccount", "Ключ", "Key", "密钥"],
  ["dp.err.unauthorized", "Войдите в аккаунт, чтобы подключать данные.", "Sign in to connect data.", "请登录后连接数据。"],
  ["dp.err.unavailable", "Подключение ключей сейчас недоступно на сервере.", "Connecting keys is not available on the server right now.", "服务器暂时无法连接密钥。"],
  ["dp.err.rate", "Слишком много попыток. Повторите через несколько минут.", "Too many attempts. Try again in a few minutes.", "尝试次数过多，请几分钟后重试。"],
  ["dp.err.key-format", "Ключ выглядит неверно: вставьте его целиком, без пробелов.", "The key looks wrong: paste all of it, with no spaces.", "密钥格式有误：请完整粘贴，不含空格。"],
  ["dp.err.key-invalid", "Провайдер не принял этот ключ.", "The provider did not accept this key.", "提供商不接受此密钥。"],
  ["dp.err.check-failed", "Не удалось проверить ключ: провайдер не ответил. Повторите позже.", "The key could not be checked: the provider did not answer. Try again later.", "无法验证密钥：提供商无响应，请稍后重试。"],
  ["dp.err.generic", "Не получилось. Повторите позже.", "That did not work. Try again later.", "操作失败，请稍后重试。"],
];

const dict: SectionDict = { ru: {}, en: {}, cn: {} };
for (const [key, ru, en, cn] of rows) {
  dict.ru[key] = ru;
  dict.en[key] = en;
  dict.cn[key] = cn;
}

export default dict;
