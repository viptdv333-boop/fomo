"use client";

import { useRef, useState } from "react";

interface Props {
  /** Receives the token to send along with the form, or "" when reset. */
  onToken: (token: string) => void;
}

type Challenge = { algorithm: string; challenge: string; salt: string; signature: string; maxnumber: number };

async function sha256Hex(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function solve(c: Challenge): Promise<number> {
  for (let n = 0; n <= c.maxnumber; n++) {
    if ((await sha256Hex(c.salt + n)) === c.challenge) return n;
    if (n % 500 === 0) await new Promise((r) => setTimeout(r));
  }
  throw new Error("unsolved");
}

/**
 * Self-hosted checkbox captcha: ticking it makes the browser solve a small
 * proof-of-work puzzle (~1-2 s). Remount with a new `key` to reset.
 */
export default function Captcha({ onToken }: Props) {
  const [state, setState] = useState<"idle" | "working" | "done" | "error">("idle");
  const busy = useRef(false);

  async function run() {
    if (busy.current || state === "done") return;
    busy.current = true;
    setState("working");
    try {
      const res = await fetch("/api/captcha", { cache: "no-store" });
      if (!res.ok) throw new Error("challenge");
      const c = (await res.json()) as Challenge;
      const number = await solve(c);
      const token = btoa(
        JSON.stringify({ algorithm: c.algorithm, challenge: c.challenge, number, salt: c.salt, signature: c.signature })
      );
      setState("done");
      onToken(token);
    } catch {
      setState("error");
      onToken("");
    } finally {
      busy.current = false;
    }
  }

  return (
    <label className="flex items-center gap-3 w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={state === "done"}
        disabled={state === "working"}
        onChange={run}
        className="w-5 h-5 accent-green-600"
      />
      <span className="text-sm text-gray-700 dark:text-gray-200">
        {state === "working"
          ? "Проверка…"
          : state === "done"
            ? "Подтверждено"
            : state === "error"
              ? "Ошибка, нажмите ещё раз"
              : "Я не робот"}
      </span>
    </label>
  );
}
