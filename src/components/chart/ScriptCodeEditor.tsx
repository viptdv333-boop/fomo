"use client";

import { useEffect, useMemo, useRef } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";

/* Dependency-free code editor: a transparent <textarea> laid over a syntax-highlighted <pre> of the same metrics,
   line-number gutter, Tab indentation, auto-indent, bracket auto-close, Ctrl+/ comment toggle, error line marker. */

const LH = 20;
const PAD = 8;
const HIGHLIGHT_LIMIT = 80_000;

const KEYWORDS = new Set([
  "const", "let", "var", "function", "return", "if", "else", "for", "while", "do", "break", "continue", "switch", "case", "default", "new", "typeof",
  "in", "of", "true", "false", "null", "undefined", "NaN", "Infinity", "this", "try", "catch", "finally", "throw", "class", "extends", "void", "delete",
]);
const GLOBALS = new Set(["ctx", "ta", "Math", "Number", "Array", "Float64Array", "Object", "JSON", "Date", "String", "Boolean", "isFinite", "isNaN", "parseFloat", "parseInt"]);
const MEMBERS = new Set([
  "bars", "n", "dt", "interval", "precision", "input", "color", "indicator", "plot", "hline", "fill", "bgcolor", "barcolor", "plotshape", "alertcondition",
  "log", "prev", "forEachBar", "series", "nan", "int", "float", "bool", "string", "select", "source",
  "sma", "ema", "rma", "wma", "hma", "dema", "tema", "alma", "vwma", "rsi", "macd", "stoch", "atr", "tr", "bbands", "keltner", "donchian", "stdev", "variance",
  "highest", "lowest", "sum", "change", "roc", "mom", "cum", "crossover", "crossunder", "cross", "rising", "falling", "barssince", "valuewhen",
  "pivothigh", "pivotlow", "linreg", "correlation", "vwap", "supertrend", "adx", "cci", "willr", "mfi", "obv", "ichimoku", "shift",
  "abs", "sqrt", "log", "exp", "floor", "ceil", "round", "sign", "neg", "add", "sub", "mul", "div", "pow", "max", "min", "gt", "gte", "lt", "lte", "eq", "neq",
  "and", "or", "not", "na", "nz", "iff", "rgba", "mix", "cond", "gradient",
]);

type Cls = "c" | "s" | "n" | "k" | "g" | "m" | "p";
interface Tok {
  t: string;
  c: Cls;
}

const CLASS: Record<Cls, string> = {
  c: "italic text-gray-400 dark:text-[#6b7280]",
  s: "text-emerald-700 dark:text-[#a5d6a7]",
  n: "text-orange-600 dark:text-[#ffb74d]",
  k: "text-purple-700 dark:text-[#c792ea]",
  g: "text-blue-700 dark:text-[#82aaff]",
  m: "text-teal-700 dark:text-[#80cbc4]",
  p: "",
};

/** Small JS tokenizer (comments, strings, numbers, identifiers). Not a parser: good enough for colouring. */
export function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  const n = src.length;
  let i = 0;
  let plain = "";
  const flush = () => {
    if (plain) {
      out.push({ t: plain, c: "p" });
      plain = "";
    }
  };
  let prevWord = "";
  let prevDot = false;
  while (i < n) {
    const ch = src[i];
    const nx = src[i + 1];
    if (ch === "/" && nx === "/") {
      flush();
      let j = i;
      while (j < n && src[j] !== "\n") j++;
      out.push({ t: src.slice(i, j), c: "c" });
      i = j;
      continue;
    }
    if (ch === "/" && nx === "*") {
      flush();
      let j = src.indexOf("*/", i + 2);
      j = j < 0 ? n : j + 2;
      out.push({ t: src.slice(i, j), c: "c" });
      i = j;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") {
      flush();
      let j = i + 1;
      while (j < n && src[j] !== ch && (ch === "`" || src[j] !== "\n")) {
        if (src[j] === "\\") j++;
        j++;
      }
      j = Math.min(n, j + 1);
      out.push({ t: src.slice(i, j), c: "s" });
      i = j;
      prevWord = "";
      prevDot = false;
      continue;
    }
    if ((ch >= "0" && ch <= "9") || (ch === "." && nx >= "0" && nx <= "9")) {
      flush();
      let j = i + 1;
      while (j < n && /[0-9a-fA-FxXeE._]/.test(src[j])) j++;
      out.push({ t: src.slice(i, j), c: "n" });
      i = j;
      prevWord = "";
      prevDot = false;
      continue;
    }
    if (/[\p{L}_$]/u.test(ch)) {
      let j = i + 1;
      while (j < n && /[\p{L}\p{N}_$]/u.test(src[j])) j++;
      const w = src.slice(i, j);
      let c: Cls = "p";
      if (prevDot && (prevWord === "ctx" || prevWord === "ta" || prevWord === "color" || prevWord === "input") && MEMBERS.has(w)) c = "m";
      else if (!prevDot && KEYWORDS.has(w)) c = "k";
      else if (!prevDot && GLOBALS.has(w)) c = "g";
      if (c === "p") plain += w;
      else {
        flush();
        out.push({ t: w, c });
      }
      prevWord = w;
      prevDot = false;
      i = j;
      continue;
    }
    if (ch === ".") {
      prevDot = true;
    } else if (ch !== " " && ch !== "\t") {
      prevDot = false;
      prevWord = "";
    }
    plain += ch;
    i++;
  }
  flush();
  return out;
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSave?: () => void;
  /** 1-based line with an error (marked in the gutter and the text). */
  errorLine?: number | null;
  /** Move the caret to a line (1-based); `nonce` makes the same line repeatable. */
  goto?: { line: number; col?: number; nonce: number } | null;
  readOnly?: boolean;
  ariaLabel?: string;
}

const PAIRS: Record<string, string> = { "(": ")", "[": "]", "{": "}", "'": "'", '"': '"', "`": "`" };
const CLOSERS = new Set([")", "]", "}", "'", '"', "`"]);

export default function ScriptCodeEditor({ value, onChange, onSave, errorLine, goto, readOnly, ariaLabel }: Props) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pendingSel = useRef<[number, number] | null>(null);

  const lineCount = useMemo(() => {
    let c = 1;
    for (let i = 0; i < value.length; i++) if (value.charCodeAt(i) === 10) c++;
    return c;
  }, [value]);

  const nodes: ReactNode = useMemo(() => {
    if (value.length > HIGHLIGHT_LIMIT) return value;
    return tokenize(value).map((tk, i) => (tk.c === "p" ? tk.t : (
      <span key={i} className={CLASS[tk.c]}>
        {tk.t}
      </span>
    )));
  }, [value]);

  // selection restored after a controlled update (fallback path when execCommand is unavailable)
  useEffect(() => {
    const ta = taRef.current;
    const sel = pendingSel.current;
    if (ta && sel) {
      ta.setSelectionRange(sel[0], sel[1]);
      pendingSel.current = null;
    }
  }, [value]);

  useEffect(() => {
    if (!goto) return;
    const ta = taRef.current;
    if (!ta) return;
    const lines = ta.value.split("\n");
    const ln = Math.max(1, Math.min(lines.length, goto.line));
    let pos = 0;
    for (let i = 0; i < ln - 1; i++) pos += lines[i].length + 1;
    const col = Math.max(0, Math.min(lines[ln - 1].length, (goto.col ?? 1) - 1));
    ta.focus();
    ta.setSelectionRange(pos + col, pos + col);
    const sc = scrollRef.current;
    if (sc) {
      const y = (ln - 1) * LH;
      if (y < sc.scrollTop + LH || y > sc.scrollTop + sc.clientHeight - LH * 3) sc.scrollTop = Math.max(0, y - sc.clientHeight / 3);
    }
  }, [goto]);

  /** Replaces [from, to) with `text` through the browser's editing pipeline (keeps native undo / redo). */
  const edit = (from: number, to: number, text: string, selFrom: number, selTo: number = selFrom) => {
    const ta = taRef.current;
    if (!ta) return;
    ta.focus();
    ta.setSelectionRange(from, to);
    let ok = false;
    try {
      ok = document.execCommand("insertText", false, text);
    } catch {
      ok = false;
    }
    if (!ok) {
      const next = ta.value.slice(0, from) + text + ta.value.slice(to);
      pendingSel.current = [selFrom, selTo];
      onChange(next);
      return;
    }
    ta.setSelectionRange(selFrom, selTo);
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    const ta = e.currentTarget;
    const v = ta.value;
    const s = ta.selectionStart;
    const en = ta.selectionEnd;
    const mod = e.ctrlKey || e.metaKey;

    if (mod && (e.key === "s" || e.key === "S")) {
      e.preventDefault();
      onSave?.();
      return;
    }
    if (mod && e.key === "/") {
      e.preventDefault();
      const ls = v.lastIndexOf("\n", s - 1) + 1;
      let le = v.indexOf("\n", en);
      if (le < 0) le = v.length;
      const block = v.slice(ls, le);
      const lines = block.split("\n");
      const allCommented = lines.every((x) => x.trim() === "" || x.trimStart().startsWith("//"));
      const next = lines
        .map((x) => {
          if (x.trim() === "") return x;
          if (allCommented) return x.replace(/^(\s*)\/\/ ?/, "$1");
          return x.replace(/^(\s*)/, "$1// ");
        })
        .join("\n");
      edit(ls, le, next, ls, ls + next.length);
      return;
    }
    if (e.key === "Tab" && !mod) {
      e.preventDefault();
      const multi = v.slice(s, en).includes("\n");
      if (!multi && !e.shiftKey) {
        edit(s, en, "  ", s + 2);
        return;
      }
      const ls = v.lastIndexOf("\n", s - 1) + 1;
      let le = v.indexOf("\n", en);
      if (le < 0) le = v.length;
      const lines = v.slice(ls, le).split("\n");
      const next = lines.map((x) => (e.shiftKey ? x.replace(/^( {1,2}|\t)/, "") : "  " + x)).join("\n");
      edit(ls, le, next, ls, ls + next.length);
      return;
    }
    if (e.key === "Enter" && !mod && !e.shiftKey) {
      const ls = v.lastIndexOf("\n", s - 1) + 1;
      const line = v.slice(ls, s);
      const indent = /^[ \t]*/.exec(line)![0];
      const before = v[s - 1];
      const after = v[en];
      e.preventDefault();
      if ((before === "{" && after === "}") || (before === "(" && after === ")") || (before === "[" && after === "]")) {
        const ins = "\n" + indent + "  \n" + indent;
        edit(s, en, ins, s + 1 + indent.length + 2);
      } else if (before === "{" || before === "(" || before === "[") {
        edit(s, en, "\n" + indent + "  ", s + 1 + indent.length + 2);
      } else {
        edit(s, en, "\n" + indent, s + 1 + indent.length);
      }
      return;
    }
    if (mod || e.altKey) return;
    if (e.key === "Backspace" && s === en && s > 0) {
      const a = v[s - 1];
      const b = v[s];
      if (PAIRS[a] && PAIRS[a] === b) {
        e.preventDefault();
        edit(s - 1, s + 1, "", s - 1);
        return;
      }
    }
    if (e.key.length === 1) {
      // step over a closing character that is already there
      if (CLOSERS.has(e.key) && s === en && v[s] === e.key && (e.key !== "'" && e.key !== '"' && e.key !== "`" ? true : v[s - 1] !== "\\")) {
        e.preventDefault();
        ta.setSelectionRange(s + 1, s + 1);
        return;
      }
      const close = PAIRS[e.key];
      if (close) {
        if (s !== en) {
          e.preventDefault();
          const sel = v.slice(s, en);
          edit(s, en, e.key + sel + close, s + 1, s + 1 + sel.length);
          return;
        }
        const next = v[s];
        const prev = v[s - 1];
        const isQuote = e.key === "'" || e.key === '"' || e.key === "`";
        const wordBefore = prev !== undefined && /[\p{L}\p{N}_]/u.test(prev);
        if ((next === undefined || /[\s)\]},;:]/.test(next)) && !(isQuote && wordBefore)) {
          e.preventDefault();
          edit(s, s, e.key + close, s + 1);
          return;
        }
      }
    }
  };

  const height = lineCount * LH + PAD * 2;
  return (
    <div
      ref={scrollRef}
      className="relative min-h-0 flex-1 overflow-auto bg-white font-mono text-[13px] dark:bg-[#131722]"
      style={{ lineHeight: `${LH}px` }}
      onMouseDown={(e) => {
        // a click on the empty area below / beside the text focuses the editor
        const ta = taRef.current;
        if (ta && e.target !== ta && !readOnly) {
          e.preventDefault();
          ta.focus();
          const end = ta.value.length;
          ta.setSelectionRange(end, end);
        }
      }}
    >
      <div className="relative flex min-w-full" style={{ minHeight: "100%" }}>
        <div
          aria-hidden="true"
          className="sticky left-0 z-10 shrink-0 select-none border-r border-gray-200 bg-gray-50 pr-2 text-right text-gray-400 dark:border-[#2a2e39] dark:bg-[#1a1e29] dark:text-gray-500"
          style={{ width: 46, paddingTop: PAD, minHeight: height }}
        >
          {Array.from({ length: lineCount }, (_, i) => (
            <div key={i} style={{ height: LH }} className={errorLine === i + 1 ? "bg-red-500/20 font-semibold text-red-500" : ""}>
              {i + 1}
            </div>
          ))}
        </div>
        <div className="relative flex-1" style={{ minHeight: height, minWidth: "max-content" }}>
          {errorLine ? <div className="pointer-events-none absolute inset-x-0 bg-red-500/10" style={{ top: PAD + (errorLine - 1) * LH, height: LH }} /> : null}
          <pre
            aria-hidden="true"
            className="pointer-events-none m-0 whitespace-pre text-gray-800 dark:text-gray-200"
            style={{ padding: PAD, paddingLeft: 10, font: "inherit", lineHeight: `${LH}px`, tabSize: 2 }}
          >
            {nodes}
            {"\n"}
          </pre>
          <textarea
            ref={taRef}
            value={value}
            readOnly={readOnly}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKeyDown}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            autoComplete="off"
            wrap="off"
            aria-label={ariaLabel}
            className="absolute inset-0 h-full w-full resize-none overflow-hidden whitespace-pre border-0 bg-transparent text-transparent caret-gray-900 outline-none selection:bg-[#2962ff]/25 dark:caret-white"
            style={{ padding: PAD, paddingLeft: 10, font: "inherit", lineHeight: `${LH}px`, tabSize: 2 }}
          />
        </div>
      </div>
    </div>
  );
}
