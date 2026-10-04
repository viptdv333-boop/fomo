import type { SectionDict } from "./types";

// Terminal indicators, part 2: catalog (favorites, recent), the settings dialog (Inputs / Style / Visibility,
// templates), the legend overlay and the newer built-in indicators. Rows are [key, ru, en, cn].
const rows: [string, string, string, string][] = [
  /* catalog */
  ["ind2.cat.fav", "Избранное", "Favorites", "收藏"],
  ["ind2.cat.builtin", "Встроенные", "Built-ins", "内置指标"],
  ["ind2.cat.recent", "Недавние", "Recently used", "最近使用"],
  ["ind.cat.ma", "Скользящие средние", "Moving averages", "移动平均线"],
  ["ind.cat.sr", "Поддержка/сопротивление", "Support / Resistance", "支撑/阻力"],
  ["ind2.fav.add", "Добавить в избранное", "Add to favorites", "加入收藏"],
  ["ind2.fav.remove", "Убрать из избранного", "Remove from favorites", "取消收藏"],
  ["ind2.fav.empty", "В избранном пусто. Нажмите звёздочку у индикатора, чтобы добавить его сюда.", "No favorites yet. Click the star next to an indicator to add it here.", "暂无收藏。点击指标旁的星标即可添加。"],
  ["ind2.recent.empty", "Здесь появятся индикаторы, которые вы добавляли", "Indicators you add will show up here", "您添加过的指标会显示在这里"],
  ["ind2.multi", "Окно остаётся открытым: добавляйте индикаторы один за другим. Добавленный отмечен галочкой", "The window stays open: add indicators one after another. Added ones are checked", "窗口保持打开，可连续添加指标，已添加的会显示对勾"],
  ["ind2.onChart", "На графике: {n}", "On chart: {n}", "已在图表上: {n}"],

  /* level / fill names */
  ["ind2.lvl.upper", "Верхняя граница", "Upper band", "上沿"],
  ["ind2.lvl.lower", "Нижняя граница", "Lower band", "下沿"],
  ["ind2.lvl.middle", "Середина", "Middle band", "中线"],
  ["ind2.lvl.zero", "Ноль", "Zero line", "零轴"],
  ["ind2.lvl.level", "Уровень", "Level", "水平线"],
  ["ind2.fill.cloudUp", "Облако (рост)", "Cloud (bullish)", "云图 (看涨)"],
  ["ind2.fill.cloudDown", "Облако (падение)", "Cloud (bearish)", "云图 (看跌)"],
  ["ind2.o.left", "Слева", "Left", "左侧"],
  ["ind2.o.right", "Справа", "Right", "右侧"],

  /* settings dialog */
  ["ind2.set.title", "Настройки: {name}", "Settings: {name}", "设置: {name}"],
  ["ind2.set.inputs", "Параметры", "Inputs", "参数"],
  ["ind2.set.style", "Стиль", "Style", "样式"],
  ["ind2.set.visibility", "Видимость", "Visibility", "可见性"],
  ["ind2.set.noInputs", "У этого индикатора нет параметров", "This indicator has no inputs", "该指标没有可调参数"],
  ["ind2.set.noStyle", "Стиль станет доступен, когда загрузятся данные графика", "Style options appear once the chart data is loaded", "图表数据加载后可设置样式"],
  ["ind2.set.defaults", "По умолчанию", "Defaults", "恢复默认"],
  ["ind2.set.template", "Шаблон", "Template", "模板"],
  ["ind2.set.ok", "Готово", "OK", "确定"],
  ["ind2.set.cancel", "Отмена", "Cancel", "取消"],
  ["ind2.set.close", "Закрыть", "Close", "关闭"],
  ["ind2.tpl.saveAs", "Сохранить как шаблон…", "Save as template…", "另存为模板…"],
  ["ind2.tpl.name", "Название шаблона", "Template name", "模板名称"],
  ["ind2.tpl.save", "Сохранить", "Save", "保存"],
  ["ind2.tpl.none", "Сохранённых шаблонов нет", "No saved templates", "暂无已保存的模板"],
  ["ind2.tpl.delete", "Удалить шаблон", "Delete template", "删除模板"],
  ["ind2.tpl.saved", "Шаблон сохранён", "Template saved", "模板已保存"],
  ["ind2.tpl.failed", "Не удалось сохранить шаблон", "Could not save the template", "模板保存失败"],
  ["ind2.tpl.local", "Не выполнен вход: шаблоны хранятся только в этом браузере", "Not signed in: templates stay in this browser only", "未登录：模板仅保存在此浏览器中"],

  /* style tab */
  ["ind2.st.plots", "Линии и графики", "Plots", "线条与图形"],
  ["ind2.st.fills", "Заливки", "Fills", "填充"],
  ["ind2.st.levels", "Уровни", "Levels", "水平线"],
  ["ind2.st.bg", "Фон между уровнями", "Background between levels", "水平线之间的背景"],
  ["ind2.st.colors", "Цвета", "Colors", "颜色"],
  ["ind2.st.pane", "Расположение", "Placement", "位置"],
  ["ind2.st.paneMain", "На основной панели", "On the main pane", "主图"],
  ["ind2.st.paneOwn", "В отдельной панели", "In its own pane", "独立窗格"],
  ["ind2.st.priceLine", "Линия цены", "Price line", "价格线"],
  ["ind2.st.lastValue", "Метка на шкале", "Scale label", "价格轴标签"],
  ["ind2.st.legendValue", "Значение в легенде", "Value in legend", "图例中显示数值"],
  ["ind2.st.width", "Толщина", "Thickness", "线宽"],
  ["ind2.st.lineStyle", "Стиль линии", "Line style", "线型"],
  ["ind2.st.type", "Тип", "Type", "类型"],
  ["ind2.st.visible", "Показывать", "Visible", "显示"],
  ["ind2.st.value", "Значение", "Value", "数值"],
  ["ind2.st.up", "Рост", "Up", "上涨"],
  ["ind2.st.down", "Падение", "Down", "下跌"],
  ["ind2.type.line", "Линия", "Line", "线"],
  ["ind2.type.step", "Ступенчатая линия", "Step line", "阶梯线"],
  ["ind2.type.area", "Область", "Area", "面积"],
  ["ind2.type.histogram", "Гистограмма", "Histogram", "直方图"],
  ["ind2.type.columns", "Столбцы", "Columns", "柱状"],
  ["ind2.type.circles", "Кружки", "Circles", "圆点"],
  ["ind2.ls.solid", "Сплошная", "Solid", "实线"],
  ["ind2.ls.dashed", "Пунктир", "Dashed", "虚线"],
  ["ind2.ls.dotted", "Точки", "Dotted", "点线"],
  ["ind2.color.opacity", "Прозрачность", "Opacity", "不透明度"],
  ["ind2.color.custom", "Свой цвет", "Custom", "自定义"],
  ["ind2.color.recent", "Недавние", "Recent", "最近"],

  /* visibility tab */
  ["ind2.vis.title", "Показывать на таймфреймах", "Show on timeframes", "在以下周期显示"],
  ["ind2.vis.hint", "Снимите галочку, чтобы скрыть индикатор на выбранных таймфреймах. Настройки сохраняются вместе с индикатором.", "Uncheck a group to hide the indicator on those timeframes. The choice is saved with the indicator.", "取消勾选即可在对应周期隐藏该指标，设置会随指标一起保存。"],
  ["ind2.vis.minutes", "Минуты", "Minutes", "分钟"],
  ["ind2.vis.hours", "Часы", "Hours", "小时"],
  ["ind2.vis.days", "Дни", "Days", "日线"],
  ["ind2.vis.weeks", "Недели", "Weeks", "周线"],
  ["ind2.vis.months", "Месяцы", "Months", "月线"],

  /* legend */
  ["ind2.lg.collapse", "Свернуть список индикаторов", "Collapse the indicator list", "收起指标列表"],
  ["ind2.lg.expand", "Показать индикаторы", "Show indicators", "展开指标列表"],
  ["ind2.lg.count", "Индикаторы ({n})", "Indicators ({n})", "指标 ({n})"],
  ["ind2.lg.more", "Ещё", "More", "更多"],
  ["ind2.lg.clone", "Клонировать", "Clone", "复制"],
  ["ind2.lg.moveMain", "Перенести на основную панель", "Move to the main pane", "移到主图"],
  ["ind2.lg.moveOwn", "Перенести в новую панель", "Move to a new pane", "移到新窗格"],
  ["ind2.lg.settings", "Настройки…", "Settings…", "设置…"],
  ["ind2.lg.tfHidden", "Скрыт на этом таймфрейме", "Hidden on this timeframe", "在当前周期已隐藏"],

  /* parameter labels of the newer indicators */
  ["ind.p.count", "Количество линий", "Number of lines", "线条数量"],
  ["ind.p.startLength", "Начальный период", "Start length", "起始周期"],
  ["ind.p.step", "Шаг периода", "Length step", "周期步长"],
  ["ind.p.deviation", "Отклонение, %", "Deviation, %", "偏差 %"],
  ["ind.p.periods", "Баров с каждой стороны", "Bars on each side", "两侧K线数"],
  ["ind.p.aoFast", "Быстрая SMA", "Fast SMA", "快速 SMA"],
  ["ind.p.aoSlow", "Медленная SMA", "Slow SMA", "慢速 SMA"],
  ["ind.p.rows", "Число рядов", "Row count", "行数"],
  ["ind.p.widthPct", "Ширина профиля, %", "Profile width, %", "分布宽度 %"],
  ["ind.p.placement", "Расположение", "Placement", "位置"],
  ["ind.p.valueArea", "Зона стоимости, %", "Value area, %", "价值区域 %"],
  ["ind.p.showVaLines", "Границы зоны стоимости", "Value area lines", "显示价值区域边界"],
  ["ind.p.colorPoc", "Цвет POC", "POC color", "POC 颜色"],

  /* names */
  ["ind.ma_ribbon.name", "Лента скользящих (MA Ribbon)", "Moving Average Ribbon", "均线飘带 (MA Ribbon)"],
  ["ind.ma_ribbon.desc", "Несколько скользящих с растущим периодом: тренд и его сила", "Several moving averages with growing lengths: trend and its strength", "多条周期递增的均线，用于判断趋势及强度"],
  ["ind.aroon.name", "Арун (Aroon)", "Aroon", "阿隆指标 (Aroon)"],
  ["ind.aroon.desc", "Время с последнего максимума и минимума: сила и смена тренда", "Time since the last high and low: trend strength and reversals", "距离最近高点和低点的时间，衡量趋势强度与转折"],
  ["ind.linreg.name", "Канал линейной регрессии", "Linear Regression Channel", "线性回归通道"],
  ["ind.linreg.desc", "Линия регрессии по последним N барам и канал ± σ", "Regression line over the last N bars with a ± σ channel", "最近 N 根 K 线的回归线及 ± σ 通道"],
  ["ind.zigzag.name", "ЗигЗаг (ZigZag)", "ZigZag", "之字转向 (ZigZag)"],
  ["ind.zigzag.desc", "Соединяет значимые развороты цены, отсекая шум меньше заданного процента", "Connects significant swing points, ignoring moves below a percentage", "连接重要转折点，过滤小于设定百分比的波动"],
  ["ind.fractals.name", "Фракталы Вильямса", "Williams Fractals", "威廉姆斯分形"],
  ["ind.fractals.desc", "Локальные максимумы и минимумы с N барами по обе стороны", "Local highs and lows with N bars on each side", "两侧各 N 根 K 线确认的局部高低点"],
  ["ind.ao.name", "Чудесный осциллятор (AO)", "Awesome Oscillator (AO)", "动量震荡指标 (AO)"],
  ["ind.ao.desc", "Разность SMA 5 и SMA 34 по средней цене; цвет показывает рост или спад", "SMA 5 minus SMA 34 of the median price; color shows rising or falling", "中价 SMA5 与 SMA34 之差，颜色表示增强或减弱"],
  ["ind.trix.name", "TRIX", "TRIX", "三重指数平滑 (TRIX)"],
  ["ind.trix.desc", "Скорость изменения тройной EMA логарифма цены, фильтрует шум", "Rate of change of the triple-smoothed EMA of log price; filters noise", "对数价格三重 EMA 的变化率，过滤噪音"],
  ["ind.cmf.name", "Денежный поток Чайкина (CMF)", "Chaikin Money Flow (CMF)", "蔡金资金流量 (CMF)"],
  ["ind.cmf.desc", "Давление покупателей и продавцов с учётом объёма, от −1 до +1", "Buying and selling pressure weighted by volume, from −1 to +1", "结合成交量的买卖压力，范围 −1 至 +1"],
  ["ind.efi.name", "Индекс силы Элдера (EFI)", "Elder's Force Index (EFI)", "艾尔德强力指数 (EFI)"],
  ["ind.efi.desc", "Изменение цены × объём, сглаженное EMA", "Price change × volume, smoothed by an EMA", "价格变化 × 成交量，经 EMA 平滑"],
  ["ind.vprofile.name", "Профиль объёма (видимый диапазон)", "Volume Profile (Visible Range)", "成交量分布 (可见范围)"],
  ["ind.vprofile.desc", "Объём по ценовым уровням видимой области, POC и зона стоимости", "Volume by price level over the visible range, with POC and value area", "可见范围内按价位分布的成交量，含 POC 与价值区域"],
];

const dict: SectionDict = { ru: {}, en: {}, cn: {} };
for (const [key, ru, en, cn] of rows) {
  dict.ru[key] = ru;
  dict.en[key] = en;
  dict.cn[key] = cn;
}

export default dict;
