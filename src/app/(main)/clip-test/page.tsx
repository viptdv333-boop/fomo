"use client";

import { useRef, useState } from "react";

/** Diagnostic page: shows exactly what the phone's browser hands to a web page when pasting. */
export default function ClipTest() {
  const [log, setLog] = useState<string[]>([]);
  const box = useRef<HTMLDivElement>(null);
  const add = (s: string) => setLog((l) => [...l, `${new Date().toLocaleTimeString()}  ${s}`]);

  const describe = (dt: DataTransfer | null) => {
    if (!dt) return "dataTransfer=null";
    const items = Array.from(dt.items || []).map((i) => `${i.kind}:${i.type}`).join(" | ") || "—";
    const files = Array.from(dt.files || []).map((f) => `${f.name} ${f.type} ${f.size}B`).join(" | ") || "—";
    return `types=[${Array.from(dt.types || []).join(", ")}] items=[${items}] files=[${files}]`;
  };

  const readClipboard = async () => {
    try {
      if (!navigator.clipboard?.read) return add("clipboard.read НЕТ в этом браузере");
      const items = await navigator.clipboard.read();
      add(`clipboard.read: ${items.length} шт.`);
      for (const it of items) add(`  типы: ${it.types.join(", ")}`);
    } catch (e) {
      add(`clipboard.read ошибка: ${(e as Error).name}: ${(e as Error).message}`);
    }
  };

  return (
    <div className="max-w-lg mx-auto p-4 flex flex-col gap-3 text-sm">
      <h1 className="text-lg font-bold">Проверка буфера обмена</h1>
      <p className="text-gray-500">1) Сделайте скриншот и скопируйте его. 2) Нажмите в поле ниже, долгое нажатие → «Вставить» (или картинка с клавиатуры). 3) Нажмите «Прочитать буфер». 4) Пришлите скриншот этого экрана.</p>
      <div
        ref={box}
        contentEditable
        suppressContentEditableWarning
        className="min-h-[56px] border-2 border-dashed rounded-xl p-3 whitespace-pre-wrap [overflow-wrap:anywhere]"
        onPaste={(e) => add(`paste: ${describe(e.clipboardData)}`)}
        onBeforeInput={(e) => add(`beforeinput: ${(e.nativeEvent as InputEvent).inputType} ${describe((e.nativeEvent as InputEvent).dataTransfer)}`)}
        onInput={() => add(`input: img=${box.current?.querySelectorAll("img").length ?? 0} html=${(box.current?.innerHTML || "").slice(0, 120)}`)}
        onFocus={() => add("focus")}
      />
      <button onClick={readClipboard} className="px-4 py-3 rounded-xl bg-green-600 text-white font-medium">
        Прочитать буфер
      </button>
      <pre className="text-xs bg-gray-100 dark:bg-gray-800 rounded-xl p-3 whitespace-pre-wrap [overflow-wrap:anywhere] min-h-[120px]">{log.join("\n") || "журнал пуст"}</pre>
      <p className="text-xs text-gray-400">{typeof navigator !== "undefined" ? navigator.userAgent : ""}</p>
    </div>
  );
}
