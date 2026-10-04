import type { SectionDict } from "./types";

// Lock card of the guest demo (terminal, calendar, board) once the free demo time of the day is used up.
// The terminal keeps its own tg.* strings (termfeat.ts). Rows are [key, ru, en, cn].
const rows: [string, string, string, string][] = [
  ["dg.cal.title", "Календарь для зарегистрированных", "The calendar is for registered users", "日历仅限注册用户"],
  ["dg.cal.text", "Войдите или зарегистрируйтесь бесплатно, чтобы продолжить пользоваться экономическим календарём и напоминаниями.", "Sign in or register for free to keep using the economic calendar and reminders.", "免费登录或注册，继续使用经济日历和提醒功能。"],
  ["dg.feed.title", "Доска для зарегистрированных", "The board is for registered users", "主页仅限注册用户"],
  ["dg.feed.text", "Войдите или зарегистрируйтесь бесплатно, чтобы читать идеи трейдеров и обсуждать их.", "Sign in or register for free to read traders' ideas and discuss them.", "免费登录或注册，即可阅读交易者的想法并参与讨论。"],
  ["dg.guestOnly", "Доступно после регистрации", "Available after registration", "注册后可用"],
];

const dict: SectionDict = { ru: {}, en: {}, cn: {} };
for (const [key, ru, en, cn] of rows) {
  dict.ru[key] = ru;
  dict.en[key] = en;
  dict.cn[key] = cn;
}

export default dict;
