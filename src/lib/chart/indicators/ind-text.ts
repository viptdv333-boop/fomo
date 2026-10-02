/* Translated strings for things an indicator paints on the canvas or puts into its legend (no React there).
   The React legend overlay hands its `t` over; until then the English fallback written at the call site is used. */

export type IndTranslator = (key: string, vars?: Record<string, string | number>) => string;

let tr: IndTranslator | null = null;

export function setIndTranslator(fn: IndTranslator | null): void {
  tr = fn;
}

function fill(s: string, vars?: Record<string, string | number>): string {
  if (!vars) return s;
  for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

export function indT(key: string, fallback: string, vars?: Record<string, string | number>): string {
  if (tr) {
    const s = tr(key, vars);
    if (s !== key) return s;
  }
  return fill(fallback, vars);
}
