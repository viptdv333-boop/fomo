// Reference-counted classes on <html> for the app UI's screens (html.app-chat-on, app-thread-on, app-ch-on, app-prof-on, app-term-on, app-calc-on).
// No React: scripts/check-tabhost.ts runs the counting with a stub element.
//
// Why: two mounted screens of the same family (the chat tab's kept screen and a private group opened from a notification at /rooms/<id>, the channels list
// and a channel page) used to share ONE class with plain add / remove calls. The second screen to go to sleep (the tab host's warm-up puts its screens
// to sleep, see tabhost/warm.ts) removed the class the first one still needed: the thread lost its edge-to-edge layout, the dock came back over the
// composer, and only a page refresh helped. Every screen now HOLDS the classes it needs; a class leaves <html> only when its last holder lets go.

const held = new Map<string, number>();

/** Anything with a classList (the real <html>, a stub in the check script). */
export interface ClassTarget {
  classList: { add: (...c: string[]) => void; remove: (...c: string[]) => void; contains: (c: string) => boolean };
}

function rootEl(): ClassTarget | null {
  return typeof document === "undefined" ? null : document.documentElement;
}

/** Holds these classes on <html> until the returned function is called (once; calling it again does nothing). Safe on the server (does nothing). */
export function holdHtmlClass(names: readonly string[], root: ClassTarget | null = rootEl()): () => void {
  const mine = names.filter(Boolean);
  for (const n of mine) {
    held.set(n, (held.get(n) ?? 0) + 1);
    root?.classList.add(n);
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    for (const n of mine) {
      const left = (held.get(n) ?? 1) - 1;
      if (left > 0) held.set(n, left);
      else {
        held.delete(n);
        root?.classList.remove(n);
      }
    }
  };
}

/** Test helper: forget every holder. */
export function resetHtmlClasses(): void {
  held.clear();
}
