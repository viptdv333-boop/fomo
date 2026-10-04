import type { SectionDict } from "./types";

/* Terminal redesign v3: labels of the page shell / top toolbar / chart card / bottom bar. */
const dict: SectionDict = {
  ru: {
    "v3.sim": "Симулятор · осталось {n}",
    "v3.sim.end": "Симулятор · данные закончились",
    "v3.sim.play": "Пуск",
    "v3.sim.pause": "Пауза",
    "v3.sim.step": "Шаг",
    "v3.sim.exit": "Выход",
    "v3.sim.speed": "Скорость: {s}x (нажмите, чтобы сменить)",
    "v3.indicators": "Индикаторы ({n})",
    "v3.indicators.hide": "Скрыть",
    "v3.indicators.show": "Показать",
    "v3.indicators.remove": "Удалить",
  },
  en: {
    "v3.sim": "Replay · {n} left",
    "v3.sim.end": "Replay · no more data",
    "v3.sim.play": "Play",
    "v3.sim.pause": "Pause",
    "v3.sim.step": "Step",
    "v3.sim.exit": "Exit",
    "v3.sim.speed": "Speed: {s}x (click to change)",
    "v3.indicators": "Indicators ({n})",
    "v3.indicators.hide": "Hide",
    "v3.indicators.show": "Show",
    "v3.indicators.remove": "Remove",
  },
  cn: {
    "v3.sim": "回放 · 剩余 {n}",
    "v3.sim.end": "回放 · 没有更多数据",
    "v3.sim.play": "播放",
    "v3.sim.pause": "暂停",
    "v3.sim.step": "步进",
    "v3.sim.exit": "退出",
    "v3.sim.speed": "速度: {s}x (点击切换)",
    "v3.indicators": "指标 ({n})",
    "v3.indicators.hide": "隐藏",
    "v3.indicators.show": "显示",
    "v3.indicators.remove": "删除",
  },
};

export default dict;
