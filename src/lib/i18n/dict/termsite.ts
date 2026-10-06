import type { SectionDict } from "./types";

// Copy of the terminal site (terminal.fomo.spot, SITE_MODE=terminal, src/lib/site-mode.ts): landing page, titles, descriptions.
// Only read when the site runs in terminal mode; the main site never shows these keys.
const dict: SectionDict = {
  ru: {
    "termsite.name": "FOMO Terminal",
    "termsite.tagline": "ТОРГОВЫЙ ТЕРМИНАЛ",
    "termsite.title": "FOMO Terminal — торговый терминал: графики, индикаторы, алерты и календарь",
    "termsite.description":
      "Торговый терминал в браузере и на телефоне: графики акций, фьючерсов МосБиржи, криптовалют и форекса, индикаторы и рисование, ценовые алерты и экономический календарь с напоминаниями.",
    "termsite.keywords": "торговый терминал, графики акций, фьючерсы MOEX, криптовалюта, форекс, ценовые алерты, экономический календарь",
    "termsite.h1": "Торговый терминал FOMO",
    "termsite.welcome":
      "Графики акций, фьючерсов МосБиржи, криптовалют и форекса, индикаторы, рисование, ценовые алерты и экономический календарь — в браузере и в приложении для Android.",
    "termsite.f1": "Графики акций, фьючерсов MOEX, криптовалют и форекса: индикаторы, рисование, несколько таймфреймов",
    "termsite.f2": "Алерты по цене и по линиям: уведомление в приложении, Telegram или на почту",
    "termsite.f3": "Экономический календарь с напоминаниями о важных событиях",
    "termsite.f4": "Избранное, линии и настройки синхронизируются между вашими устройствами",
    "termsite.try": "Открыть терминал без регистрации",
    "termsite.separate": "У FOMO Terminal свой аккаунт: вход и данные fomo.spot здесь не действуют.",
    "termsite.android": "FOMO Terminal для Android",
    "termsite.androidName": "Android (APK)",
    "termsite.androidHint": "Разрешите установку из этого источника",
    "termsite.back": "В терминал",
  },
  en: {
    "termsite.name": "FOMO Terminal",
    "termsite.tagline": "TRADING TERMINAL",
    "termsite.title": "FOMO Terminal — trading terminal: charts, indicators, alerts and calendar",
    "termsite.description":
      "A trading terminal in the browser and on your phone: charts of stocks, MOEX futures, crypto and forex, indicators and drawing tools, price alerts and an economic calendar with reminders.",
    "termsite.keywords": "trading terminal, stock charts, MOEX futures, crypto, forex, price alerts, economic calendar",
    "termsite.h1": "FOMO trading terminal",
    "termsite.welcome":
      "Charts of stocks, MOEX futures, crypto and forex, indicators, drawing tools, price alerts and an economic calendar — in the browser and in the Android app.",
    "termsite.f1": "Charts of stocks, MOEX futures, crypto and forex: indicators, drawing tools, several timeframes",
    "termsite.f2": "Price and line alerts: a notification in the app, Telegram or e-mail",
    "termsite.f3": "Economic calendar with reminders for important events",
    "termsite.f4": "Favourites, lines and settings sync across your devices",
    "termsite.try": "Open the terminal without signing up",
    "termsite.separate": "FOMO Terminal has its own account: the fomo.spot login and data do not apply here.",
    "termsite.android": "FOMO Terminal for Android",
    "termsite.androidName": "Android (APK)",
    "termsite.androidHint": "Allow installing from this source",
    "termsite.back": "To the terminal",
  },
  cn: {
    "termsite.name": "FOMO Terminal",
    "termsite.tagline": "交易终端",
    "termsite.title": "FOMO Terminal — 交易终端：图表、指标、提醒和日历",
    "termsite.description": "浏览器和手机上的交易终端：股票、莫斯科交易所期货、加密货币和外汇图表，指标和画线工具，价格提醒以及带提醒功能的经济日历。",
    "termsite.keywords": "交易终端, 股票图表, MOEX 期货, 加密货币, 外汇, 价格提醒, 经济日历",
    "termsite.h1": "FOMO 交易终端",
    "termsite.welcome": "股票、莫斯科交易所期货、加密货币和外汇图表，指标、画线工具、价格提醒和经济日历——在浏览器和 Android 应用中使用。",
    "termsite.f1": "股票、MOEX 期货、加密货币和外汇图表：指标、画线工具、多个时间周期",
    "termsite.f2": "价格和线条提醒：应用内通知、Telegram 或电子邮件",
    "termsite.f3": "带重要事件提醒的经济日历",
    "termsite.f4": "收藏、线条和设置在您的设备之间同步",
    "termsite.try": "无需注册即可打开终端",
    "termsite.separate": "FOMO Terminal 使用独立账户：fomo.spot 的登录和数据在此无效。",
    "termsite.android": "FOMO Terminal Android 版",
    "termsite.androidName": "Android (APK)",
    "termsite.androidHint": "请允许从此来源安装",
    "termsite.back": "返回终端",
  },
};

export default dict;
