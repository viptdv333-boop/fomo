import type { SectionDict } from "./types";

// Search-facing copy: <title>, meta description, keywords, OG and JSON-LD.
// Russian values are the exact strings the site shipped with before i18n, so
// Russian rankings see no change. Keywords are comma-separated lists.
const dict: SectionDict = {
  ru: {
    "seo.instrumentPage.title": "{name}: график, котировки и торговые идеи",
    "seo.instrumentPage.description": "{name} онлайн: график, котировки, статистика и свежие торговые идеи трейдеров на FOMO.",
    "seo.feedPage.title": "Торговые идеи по {name}",
    "seo.feedPage.description": "Прогнозы и торговые идеи трейдеров по {name}: точки входа, стопы и цели. Обсуждение на FOMO.",
    "seo.categoryPage.title": "{name}: инструменты, графики и идеи",
    "seo.categoryPage.description": "{name}: список инструментов с графиками, котировками и торговыми идеями трейдеров на FOMO.",
    // Site-wide default (root layout) and home page
    "seo.site.title": "Торговые идеи и аналитика фондового рынка — FOMO",
    "seo.site.description":
      "Торговые идеи и прогнозы от трейдеров: акции, фьючерсы МосБиржи, криптовалюта, форекс. Технический анализ, сигналы, подписки на авторов. Публикуйте свои идеи.",
    "seo.site.keywords":
      "торговые идеи, торговые идеи мосбиржа, инвестиционные идеи, аналитика фондового рынка, прогнозы по акциям, технический анализ акций, торговые сигналы, фьючерсы МосБиржи, трейдинг, инвестиции в акции, подписка на трейдера, социальная сеть для трейдеров, прогноз индекса МосБиржи, криптовалюта аналитика, trading ideas, stock market analysis, trading signals, social trading network",
    "seo.org.description":
      "Платформа для публикации и обсуждения торговых идей: акции, фьючерсы МосБиржи, криптовалюта, форекс.",
    "seo.website.description": "Торговые идеи и аналитика фондового рынка от профессиональных трейдеров.",

    // Sections
    "seo.authors.title": "Трейдеры и аналитики: рейтинг авторов",
    "seo.authors.description":
      "Профессиональные трейдеры и инвестиционные аналитики FOMO. Рейтинг по доходности идей, специализации и опыту на бирже. Подпишитесь на лучших авторов.",
    "seo.authors.keywords":
      "трейдеры, инвестиционные аналитики, рейтинг трейдеров, подписка на трейдера, копитрейдинг, лучшие трейдеры России",

    "seo.calculator.title": "Калькулятор риска и позиции — фьючерсы МосБиржи",
    "seo.calculator.description":
      "Рассчитайте количество фьючерсных контрактов по риску на сделку: депозит, вход, стоп, тейк — актуальные данные биржи (шаг цены, ГО) в реальном времени.",
    "seo.calculator.keywords":
      "калькулятор риска, калькулятор позиции трейдера, расчёт лота фьючерс, риск менеджмент трейдинг, гарантийное обеспечение фьючерс",

    "seo.channels.title": "Платные каналы трейдеров и подписка на сигналы",
    "seo.channels.description":
      "Каналы трейдеров с эксклюзивной аналитикой и торговыми сигналами по акциям, фьючерсам и криптовалюте. Выбирайте тариф и подписывайтесь на автора.",
    "seo.channels.keywords":
      "платные сигналы трейдеров, каналы трейдеров, подписка на торговые сигналы, сигналы для трейдинга, аналитика по подписке",

    "seo.chat.title": "Чат трейдеров: обсуждение рынка онлайн",
    "seo.chat.description":
      "Живой чат трейдеров и инвесторов: обсуждение акций, фьючерсов и криптовалют в отдельных комнатах по инструментам. Делитесь сделками и мнением о рынке.",
    "seo.chat.keywords":
      "чат трейдеров, форум трейдеров, сообщество инвесторов, обсуждение акций, социальная сеть для трейдеров",

    "seo.feed.title": "Торговые идеи и прогнозы по акциям",
    "seo.feed.description":
      "Свежие торговые идеи и прогнозы от трейдеров: акции, фьючерсы МосБиржи, криптовалюта, форекс. Технический анализ, точки входа и цели. Читайте бесплатно.",
    "seo.feed.keywords":
      "торговые идеи, идеи для инвестиций, прогнозы по акциям, торговые сигналы, технический анализ акций, аналитика фьючерсов, прогноз индекса МосБиржи",

    "seo.instruments.title": "Акции, фьючерсы и криптовалюта: аналитика",
    "seo.instruments.description":
      "Каталог биржевых инструментов: акции РФ и США, фьючерсы МосБиржи, криптовалюта, форекс, нефть и золото. Котировки, графики и торговые идеи по каждому активу.",
    "seo.instruments.keywords":
      "акции, фьючерсы МосБиржи, криптовалюта, нефть Brent, котировки акций, аналитика по инструментам, инвестиции в акции",

    "seo.terminal.title": "Торговый терминал онлайн — аналог TradingView для МосБиржи и крипты",
    "seo.terminal.description":
      "Бесплатный торговый терминал: графики акций и фьючерсов МосБиржи, Bybit, футпринт (кластерный график), объёмный профиль, VWAP, 60+ индикаторов, 126 инструментов рисования, свои индикаторы на JS, скачать свечи в CSV.",
    "seo.terminal.keywords":
      "торговый терминал, аналог TradingView, терминал для МосБиржи, футпринт, кластерный график, объёмный профиль, VWAP, графики акций онлайн, скачать свечи, свечи CSV, котировки МосБиржи, график биткоина, технический анализ онлайн",

    // noindex account areas — title only
    "seo.messages.title": "Сообщения",
    "seo.payments.title": "Платежи",
    "seo.profile.title": "Профиль",
    "seo.subscriptions.title": "Подписки",

    // Help / knowledge base
    "seo.help.title": "Как пользоваться FOMO — доска идей, терминал, календарь, платные каналы",
    "seo.help.description":
      "Инструкция по FOMO: регистрация, публикация идей, платные каналы и приём оплаты (в том числе по ссылке), торговый терминал с индикаторами и алертами, экономический календарь, уведомления в Telegram. Комиссия площадки — 0%.",
    "seo.help.keywords":
      "как пользоваться FOMO, как публиковать торговые идеи, платный канал трейдера, торговый терминал онлайн, экономический календарь, алерты в Telegram, оплата по ссылке, инструкция FOMO",
    "seo.help.ogTitle": "Как пользоваться FOMO — полная инструкция",
    "seo.help.ogDescription":
      "Доска идей, платные каналы, приём оплаты, терминал, экономический календарь и уведомления. Комиссия площадки — 0%.",

    // Legal
    "seo.terms.title": "Пользовательское соглашение",
    "seo.terms.description": "Условия использования платформы FOMO.",
    "seo.privacy.title": "Политика обработки персональных данных",
    "seo.privacy.description": "Политика обработки персональных данных пользователей FOMO.",

    // Dynamic pages (user content is inserted as-is)
    "seo.idea.notFound": "Идея не найдена",
    "seo.author.notFound": "Автор не найден",
    "seo.author.title": "{name} — трейдер на FOMO",
    "seo.author.description":
      "{name}: {count} идей на FOMO, рейтинг {rating}. Читайте аналитику и подпишитесь на автора.",
  },
  en: {
    "seo.instrumentPage.title": "{name}: chart, quotes and trading ideas",
    "seo.instrumentPage.description": "{name} live: price chart, quotes, key stats and fresh trading ideas from traders on FOMO.",
    "seo.feedPage.title": "{name} trading ideas",
    "seo.feedPage.description": "Trader forecasts and trade setups for {name}: entries, stop losses and targets. Discuss on FOMO.",
    "seo.categoryPage.title": "{name}: instruments, charts and ideas",
    "seo.categoryPage.description": "{name}: instruments with live charts, quotes and trading ideas from traders on FOMO.",
    "seo.site.title": "Trading Ideas & Stock Market Analysis — FOMO",
    "seo.site.description":
      "Trading ideas and forecasts from traders: stocks, Moscow Exchange futures, crypto, forex. Technical analysis, signals, author subscriptions. Share your ideas.",
    "seo.site.keywords":
      "trading ideas, stock market analysis, trading signals, stock forecasts, technical analysis, Moscow Exchange futures, MOEX, trading, stock investing, follow traders, copy trading, social trading network, crypto analysis, forex analysis",
    "seo.org.description":
      "A platform to publish and discuss trading ideas: stocks, Moscow Exchange futures, crypto and forex.",
    "seo.website.description": "Trading ideas and stock market analysis from professional traders.",

    "seo.authors.title": "Top Traders & Analysts: Author Rankings",
    "seo.authors.description":
      "Professional traders and investment analysts on FOMO, ranked by idea performance, specialization and market experience. Follow the best authors.",
    "seo.authors.keywords":
      "top traders, investment analysts, trader rankings, follow a trader, copy trading, best Russian traders",

    "seo.calculator.title": "Position Size Calculator — Moscow Exchange Futures",
    "seo.calculator.description":
      "Work out how many futures contracts to trade for your risk per trade: deposit, entry, stop, take-profit — with live exchange data (tick size, margin).",
    "seo.calculator.keywords":
      "position size calculator, risk calculator, futures lot size calculator, trading risk management, futures initial margin, MOEX futures",

    "seo.channels.title": "Paid Trader Channels & Trading Signal Subscriptions",
    "seo.channels.description":
      "Trader channels with exclusive analysis and trading signals on stocks, futures and crypto. Choose a plan and subscribe to an author.",
    "seo.channels.keywords":
      "paid trading signals, trader channels, trading signal subscription, trading signals, premium market analysis",

    "seo.chat.title": "Trader Chat: Live Market Discussion",
    "seo.chat.description":
      "Live chat for traders and investors: discuss stocks, futures and crypto in dedicated rooms per instrument. Share your trades and market views.",
    "seo.chat.keywords":
      "trader chat, trading forum, investor community, stock discussion, social network for traders",

    "seo.feed.title": "Trading Ideas & Stock Forecasts",
    "seo.feed.description":
      "Fresh trading ideas and forecasts from traders: stocks, Moscow Exchange futures, crypto, forex. Technical analysis, entry points and targets. Free to read.",
    "seo.feed.keywords":
      "trading ideas, investment ideas, stock forecasts, trading signals, stock technical analysis, futures analysis, MOEX index forecast",

    "seo.instruments.title": "Stocks, Futures & Crypto: Market Analysis",
    "seo.instruments.description":
      "Catalog of instruments: Russian and US stocks, Moscow Exchange futures, crypto, forex, oil and gold. Quotes, charts and trading ideas for every asset.",
    "seo.instruments.keywords":
      "stocks, Moscow Exchange futures, cryptocurrency, Brent oil, stock quotes, instrument analysis, stock investing",

    "seo.terminal.title": "Online Trading Terminal — TradingView Alternative for MOEX and Crypto",
    "seo.terminal.description":
      "Free trading terminal: Moscow Exchange stocks and futures, Bybit crypto, footprint charts, volume profile, VWAP, 60+ indicators, 126 drawing tools, custom JS indicators, download candles as CSV.",
    "seo.terminal.keywords":
      "trading terminal, TradingView alternative, footprint chart, order flow, volume profile, VWAP, Moscow Exchange charts, download candles, candles CSV, bitcoin chart, online technical analysis, real-time quotes",

    "seo.messages.title": "Messages",
    "seo.payments.title": "Payments",
    "seo.profile.title": "Profile",
    "seo.subscriptions.title": "Subscriptions",

    "seo.help.title": "How to Use FOMO: Idea Board, Terminal, Calendar, Paid Channels",
    "seo.help.description":
      "FOMO guide: sign-up, publishing trading ideas, paid channels and accepting payments (including by link), the trading terminal with indicators and alerts, the economic calendar and Telegram notifications. Platform commission: 0%.",
    "seo.help.keywords":
      "how to use FOMO, how to publish trading ideas, paid trader channel, online trading terminal, economic calendar, Telegram price alerts, payment by link, FOMO guide",
    "seo.help.ogTitle": "How to Use FOMO — Complete Guide",
    "seo.help.ogDescription":
      "The idea board, paid channels, accepting payments, the terminal, the economic calendar and notifications. Platform commission: 0%.",

    "seo.terms.title": "Terms of Service",
    "seo.terms.description": "Terms of use of the FOMO trading ideas platform.",
    "seo.privacy.title": "Privacy Policy",
    "seo.privacy.description": "How FOMO collects, uses and protects its users' personal data.",

    "seo.idea.notFound": "Idea not found",
    "seo.author.notFound": "Author not found",
    "seo.author.title": "{name} — Trader on FOMO",
    "seo.author.description":
      "{name}: {count} trading ideas on FOMO, rating {rating}. Read their market analysis and follow the author.",
  },
  cn: {
    "seo.instrumentPage.title": "{name}：图表、行情和交易观点",
    "seo.instrumentPage.description": "{name} 实时图表、行情、关键数据以及 FOMO 交易者的最新交易观点。",
    "seo.feedPage.title": "{name} 交易观点",
    "seo.feedPage.description": "交易者对 {name} 的预测和交易计划：入场、止损和目标价。在 FOMO 上讨论。",
    "seo.categoryPage.title": "{name}：交易品种、图表和观点",
    "seo.categoryPage.description": "{name}：包含实时图表、行情和交易者观点的交易品种列表，尽在 FOMO。",
    "seo.site.title": "交易观点与股市分析 — FOMO",
    "seo.site.description":
      "来自交易员的交易观点与行情预测：股票、莫斯科交易所期货、加密货币、外汇。技术分析、交易信号、订阅作者。发布您自己的交易观点。",
    "seo.site.keywords":
      "交易观点, 股市分析, 交易信号, 股票预测, 技术分析, 莫斯科交易所期货, 莫斯科交易所, 交易, 股票投资, 关注交易员, 跟单交易, 社交交易平台, 加密货币分析, 外汇分析",
    "seo.org.description": "发布与讨论交易观点的平台：股票、莫斯科交易所期货、加密货币、外汇。",
    "seo.website.description": "来自专业交易员的交易观点与股市分析。",

    "seo.authors.title": "交易员与分析师：作者排行榜",
    "seo.authors.description":
      "FOMO 上的专业交易员与投资分析师，按观点收益、专业方向和交易经验排名。关注最优秀的作者。",
    "seo.authors.keywords": "交易员, 投资分析师, 交易员排行榜, 关注交易员, 跟单交易, 俄罗斯顶尖交易员",

    "seo.calculator.title": "仓位计算器 — 莫斯科交易所期货",
    "seo.calculator.description":
      "按单笔交易风险计算期货合约数量：资金、入场、止损、止盈，并使用实时交易所数据（最小变动价位、保证金）。",
    "seo.calculator.keywords": "仓位计算器, 风险计算器, 期货手数计算, 交易风险管理, 期货保证金, 莫斯科交易所期货",

    "seo.channels.title": "付费交易员频道与交易信号订阅",
    "seo.channels.description":
      "交易员频道提供股票、期货和加密货币的独家分析与交易信号。选择套餐，订阅您喜欢的作者。",
    "seo.channels.keywords": "付费交易信号, 交易员频道, 交易信号订阅, 交易信号, 付费行情分析",

    "seo.chat.title": "交易员聊天室：在线讨论行情",
    "seo.chat.description":
      "交易员与投资者的实时聊天室：按品种分房间讨论股票、期货和加密货币，分享您的交易与市场观点。",
    "seo.chat.keywords": "交易员聊天室, 交易论坛, 投资者社区, 股票讨论, 交易员社交网络",

    "seo.feed.title": "交易观点与股票行情预测",
    "seo.feed.description":
      "交易员最新的交易观点与预测：股票、莫斯科交易所期货、加密货币、外汇。技术分析、入场点与目标价，免费阅读。",
    "seo.feed.keywords": "交易观点, 投资观点, 股票预测, 交易信号, 股票技术分析, 期货分析, 莫斯科交易所指数预测",

    "seo.instruments.title": "股票、期货与加密货币：行情分析",
    "seo.instruments.description":
      "交易品种目录：俄罗斯与美国股票、莫斯科交易所期货、加密货币、外汇、原油与黄金。每个资产的行情、图表与交易观点。",
    "seo.instruments.keywords": "股票, 莫斯科交易所期货, 加密货币, 布伦特原油, 股票行情, 品种分析, 股票投资",

    "seo.terminal.title": "在线交易终端 — 莫斯科交易所与加密货币的TradingView替代品",
    "seo.terminal.description":
      "免费交易终端：莫斯科交易所股票与期货、Bybit加密货币、足迹图、成交量分布、VWAP、60+指标、126种绘图工具、自定义JS指标，K线可下载为CSV。",
    "seo.terminal.keywords": "交易终端, TradingView替代, 足迹图, 订单流, 成交量分布, VWAP, 莫斯科交易所图表, 下载K线, K线CSV, 比特币走势图, 在线技术分析, 实时行情",

    "seo.messages.title": "私信",
    "seo.payments.title": "付款",
    "seo.profile.title": "个人资料",
    "seo.subscriptions.title": "订阅",

    "seo.help.title": "FOMO 使用指南：观点看板、交易终端、财经日历与付费频道",
    "seo.help.description":
      "FOMO 使用指南：注册、发布交易观点、付费频道与收款（含链接付款）、带指标和价格提醒的交易终端、财经日历以及 Telegram 通知。平台佣金为 0%。",
    "seo.help.keywords": "如何使用 FOMO, 如何发布交易观点, 交易员付费频道, 在线交易终端, 财经日历, Telegram 价格提醒, 链接付款, FOMO 使用指南",
    "seo.help.ogTitle": "FOMO 使用指南 — 完整教程",
    "seo.help.ogDescription": "观点看板、付费频道、收款、交易终端、财经日历与通知。平台佣金为 0%。",

    "seo.terms.title": "用户协议",
    "seo.terms.description": "FOMO 交易观点平台的使用条款。",
    "seo.privacy.title": "隐私政策",
    "seo.privacy.description": "FOMO 如何收集、使用和保护用户的个人数据。",

    "seo.idea.notFound": "未找到该观点",
    "seo.author.notFound": "未找到该作者",
    "seo.author.title": "{name} — FOMO 交易员",
    "seo.author.description": "{name}：在 FOMO 发布了 {count} 条交易观点，评分 {rating}。阅读其市场分析并关注作者。",
  },
};

export default dict;
