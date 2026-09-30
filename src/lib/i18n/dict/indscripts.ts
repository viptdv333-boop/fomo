import type { SectionDict } from "./types";

// Terminal: user-written indicators (JavaScript scripts in a sandboxed worker): the "My scripts" catalog tab,
// the editor, the template gallery and the legend badges. The API reference itself lives in lib/chart/scripts/docs.ts.
// Rows are [key, ru, en, cn].
const rows: [string, string, string, string][] = [
  /* catalog */
  ["isc.cat", "Мои скрипты", "My scripts", "我的脚本"],
  ["isc.newScript", "Новый скрипт", "New script", "新建脚本"],
  ["isc.import", "Импорт", "Import", "导入"],
  ["isc.export", "Экспорт", "Export", "导出"],
  ["isc.exportJson", "Скачать .json", "Download .json", "下载 .json"],
  ["isc.exportJs", "Скачать .js", "Download .js", "下载 .js"],
  ["isc.noScripts", "У вас пока нет своих индикаторов. Напишите скрипт на JavaScript или начните с шаблона.", "You have no custom indicators yet. Write a JavaScript script or start from a template.", "您还没有自定义指标。可以编写 JavaScript 脚本，或从模板开始。"],
  ["isc.fromTemplate", "Из шаблона", "From template", "从模板创建"],
  ["isc.list.edit", "Изменить код", "Edit code", "编辑代码"],
  ["isc.list.add", "Добавить на график", "Add to chart", "添加到图表"],
  ["isc.list.delete", "Удалить скрипт", "Delete script", "删除脚本"],
  ["isc.tag", "скрипт", "script", "脚本"],
  ["isc.local", "Вы не вошли в аккаунт: скрипты хранятся только в этом браузере.", "You are not signed in: scripts are stored in this browser only.", "您尚未登录：脚本仅保存在此浏览器中。"],
  ["isc.multiHint", "Скрипты работают в изолированном потоке: без сети и доступа к странице", "Scripts run in an isolated worker: no network, no access to the page", "脚本在隔离线程中运行：无网络，无法访问页面"],

  /* editor chrome */
  ["isc.title", "Редактор индикаторов", "Indicator editor", "指标编辑器"],
  ["isc.name", "Название", "Name", "名称"],
  ["isc.editSource", "Исходный код", "Edit source", "编辑源码"],
  ["isc.save", "Сохранить", "Save", "保存"],
  ["isc.saveAs", "Сохранить как…", "Save as…", "另存为…"],
  ["isc.saveAsName", "Название копии", "Name of the copy", "副本名称"],
  ["isc.saved", "Сохранено", "Saved", "已保存"],
  ["isc.saveFailed", "Не удалось сохранить (лимит или размер)", "Could not save (limit or size)", "保存失败（数量或大小超限）"],
  ["isc.unsaved", "Есть несохранённые изменения", "Unsaved changes", "有未保存的更改"],
  ["isc.addToChart", "Добавить на график", "Add to chart", "添加到图表"],
  ["isc.updateOnChart", "Обновить на графике", "Update on chart", "更新图表"],
  ["isc.onChart", "На графике", "On chart", "已在图表上"],
  ["isc.docs", "Справка", "Docs", "文档"],
  ["isc.templates", "Шаблоны", "Templates", "模板"],
  ["isc.delete", "Удалить", "Delete", "删除"],
  ["isc.deleteConfirm", "Удалить скрипт «{name}»? Индикаторы на графике перестанут работать.", "Delete the script “{name}”? Its indicators on the chart will stop working.", "删除脚本“{name}”？图表上的对应指标将失效。"],
  ["isc.discardConfirm", "Закрыть без сохранения? Правки будут потеряны.", "Close without saving? Your changes will be lost.", "不保存直接关闭？您的更改将丢失。"],
  ["isc.close", "Закрыть", "Close", "关闭"],
  ["isc.yes", "Да", "Yes", "是"],
  ["isc.no", "Нет", "No", "否"],
  ["isc.keys", "Tab — отступ · Ctrl+S — сохранить · автозакрытие скобок", "Tab indents · Ctrl+S saves · brackets auto-close", "Tab 缩进 · Ctrl+S 保存 · 括号自动闭合"],
  ["isc.unsupported", "Этот браузер не поддерживает Web Workers: скрипты не запустятся.", "This browser has no Web Workers: scripts can not run.", "此浏览器不支持 Web Workers：脚本无法运行。"],
  ["isc.tooBig", "Код слишком длинный (максимум {n} символов)", "The code is too long (max {n} characters)", "代码过长（最多 {n} 个字符）"],
  ["isc.copy", "Копировать", "Copy", "复制"],
  ["isc.copied", "Скопировано", "Copied", "已复制"],
  ["isc.insert", "В редактор", "Insert", "插入"],
  ["isc.importFailed", "Не удалось прочитать файл", "Could not read the file", "无法读取文件"],
  ["isc.noData", "Нет данных графика", "No chart data", "没有图表数据"],

  /* status + output panels */
  ["isc.st.running", "Выполняется…", "Running…", "运行中…"],
  ["isc.st.ok", "OK · {ms} мс · {bars} баров", "OK · {ms} ms · {bars} bars", "正常 · {ms} 毫秒 · {bars} 根K线"],
  ["isc.st.error", "Ошибка", "Error", "错误"],
  ["isc.st.idle", "Ожидание данных", "Waiting for data", "等待数据"],
  ["isc.out.problems", "Ошибки", "Problems", "问题"],
  ["isc.out.console", "Консоль", "Console", "控制台"],
  ["isc.out.alertsTab", "Оповещения", "Alerts", "提醒"],
  ["isc.out.alerts", "Условия оповещений (только хранятся)", "Alert conditions (stored only)", "提醒条件（仅保存）"],
  ["isc.out.none", "Нет ошибок", "No problems", "没有问题"],
  ["isc.out.consoleEmpty", "Здесь появится вывод ctx.log(…)", "ctx.log(…) output appears here", "ctx.log(…) 的输出显示在这里"],
  ["isc.out.alertRow", "{message} — сработало на {n} барах", "{message} — true on {n} bars", "{message} — 在 {n} 根K线上成立"],
  ["isc.out.alertLast", "сейчас активно", "active now", "当前有效"],
  ["isc.out.line", "строка {line}", "line {line}", "第 {line} 行"],
  ["isc.out.shapesCut", "Показаны не все метки: лимит 2000", "Not all markers are shown: limit is 2000", "标记未全部显示：上限 2000"],

  /* legend badge */
  ["isc.badge.error", "Ошибка скрипта", "Script error", "脚本错误"],
  ["isc.badge.pending", "Вычисляется…", "Computing…", "计算中…"],

  /* templates */
  ["isc.tpl.blank", "Пустой скрипт", "Blank script", "空白脚本"],
  ["isc.tpl.blank.d", "Заготовка: параметры, одна линия", "Skeleton: inputs and one line", "骨架：参数与一条线"],
  ["isc.tpl.smacross", "Пересечение SMA", "SMA cross", "SMA 交叉"],
  ["isc.tpl.smacross.d", "Две скользящие и сигналы Buy / Sell", "Two moving averages with Buy / Sell markers", "双均线与买/卖标记"],
  ["isc.tpl.emaribbon", "Лента EMA", "EMA ribbon", "EMA 彩带"],
  ["isc.tpl.emaribbon.d", "8 EMA с плавной сменой цвета", "8 EMAs with a colour gradient", "8 条渐变色 EMA"],
  ["isc.tpl.rsi", "RSI с сигналами", "RSI with signals", "带信号的 RSI"],
  ["isc.tpl.rsi.d", "Уровни, подсветка зон, выход из зон", "Levels, zone shading, zone exits", "水平线、区域着色、区域离场"],
  ["isc.tpl.squeeze", "Сжатие Боллинджера", "Bollinger squeeze", "布林带挤压"],
  ["isc.tpl.squeeze.d", "BB внутри канала Кельтнера", "Bollinger inside Keltner channel", "布林带位于肯特纳通道内"],
  ["isc.tpl.supertrend", "Supertrend", "Supertrend", "Supertrend 超级趋势"],
  ["isc.tpl.supertrend.d", "Линия тренда и смена направления", "Trend line and direction flips", "趋势线与方向转换"],
  ["isc.tpl.donchian", "Канал Дончиана", "Donchian channel", "唐奇安通道"],
  ["isc.tpl.donchian.d", "Канал по экстремумам и пробои", "Extremes channel and breakouts", "极值通道与突破"],
  ["isc.tpl.macdhist", "MACD с цветной гистограммой", "MACD with coloured histogram", "彩色柱 MACD"],
  ["isc.tpl.macdhist.d", "Четыре цвета столбцов", "Four bar colours", "四色柱状图"],
  ["isc.tpl.vwap", "VWAP за сессию", "Session VWAP", "日内 VWAP"],
  ["isc.tpl.vwap.d", "Сброс каждый день, полосы σ", "Resets daily, σ bands", "每日重置，σ 通道"],
  ["isc.tpl.volspike", "Всплески объёма", "Volume spikes", "成交量激增"],
  ["isc.tpl.volspike.d", "Маркеры при объёме выше среднего в K раз", "Markers when volume is K× above average", "成交量高于均值 K 倍时标记"],
  ["isc.tpl.insidebar", "Внутренний бар", "Inside bar", "内包线"],
  ["isc.tpl.insidebar.d", "Маркер и окраска свечи", "Marker and candle colour", "标记并给K线着色"],
  ["isc.tpl.zigzag", "ZigZag по пивотам", "ZigZag (pivots)", "枢轴 ZigZag"],
  ["isc.tpl.zigzag.d", "Соединяет вершины и впадины", "Connects swing highs and lows", "连接波段高点与低点"],

  /* docs chrome */
  ["isc.docs.title", "Справка по API", "API reference", "API 参考"],
  ["isc.docs.search", "Поиск по справке", "Search the reference", "搜索文档"],
  ["isc.docs.empty", "Ничего не найдено", "Nothing found", "未找到内容"],
];

const dict: SectionDict = { ru: {}, en: {}, cn: {} };
for (const [key, ru, en, cn] of rows) {
  dict.ru[key] = ru;
  dict.en[key] = en;
  dict.cn[key] = cn;
}

export default dict;
