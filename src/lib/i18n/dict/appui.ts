import type { SectionDict } from "./types";

// Lightweight interface of the Android app (tab bar, compact header, profile sheet). Tab names reuse nav.*.
const dict: SectionDict = {
  ru: {
    "appui.nav": "Основная навигация",
    "appui.tab.settings": "Настройки",
    "appui.unread": "непрочитанных: {n}",
    "appui.profile": "Профиль и меню",
    "appui.close": "Закрыть",
    "appui.fontSize": "Размер текста",
    "appui.fontS": "Мелкий",
    "appui.fontM": "Обычный",
    "appui.fontL": "Крупный",
    "appui.fontXl": "Очень крупный",
  },
  en: {
    "appui.nav": "Main navigation",
    "appui.tab.settings": "Settings",
    "appui.unread": "unread: {n}",
    "appui.profile": "Profile and menu",
    "appui.close": "Close",
    "appui.fontSize": "Text size",
    "appui.fontS": "Small",
    "appui.fontM": "Normal",
    "appui.fontL": "Large",
    "appui.fontXl": "Extra large",
  },
  cn: {
    "appui.nav": "主导航",
    "appui.tab.settings": "设置",
    "appui.unread": "未读：{n}",
    "appui.profile": "个人资料和菜单",
    "appui.close": "关闭",
    "appui.fontSize": "文字大小",
    "appui.fontS": "小",
    "appui.fontM": "标准",
    "appui.fontL": "大",
    "appui.fontXl": "特大",
  },
};
export default dict;
