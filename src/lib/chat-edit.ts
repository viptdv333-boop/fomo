// Pure logic of editing an own chat message in the MAIN composer (Telegram style). No React, no DOM:
// scripts/check-chat-edit.ts runs it. The composer UI lives in ChatRoom.tsx / app/chat/AppRoomThread.tsx.

/** What the composer held before the edit started; it comes back after save / cancel. */
export interface EditState<D> {
  editingId: string | null;
  draft: D | null;
}

export function idleEdit<D>(): EditState<D> {
  return { editingId: null, draft: null };
}

/**
 * Start editing message `id`. `current` is what the composer holds right now.
 * Switching from one message to another keeps the ORIGINAL draft (the half-edited text of the first message
 * must not become the "draft" that comes back at the end).
 */
export function beginEdit<D>(s: EditState<D>, id: string, current: D): EditState<D> {
  if (s.editingId !== null) return { editingId: id, draft: s.draft };
  return { editingId: id, draft: current };
}

/** Finish (save or cancel): the state goes idle, `restore` is the draft to put back into the composer (null = nothing was editing). */
export function endEdit<D>(s: EditState<D>): { state: EditState<D>; restore: D | null } {
  if (s.editingId === null) return { state: idleEdit<D>(), restore: null };
  return { state: idleEdit<D>(), restore: s.draft };
}

export type SubmitPlan = { kind: "empty" } | { kind: "unchanged" } | { kind: "save"; text: string };

/** What Enter / the Save button does: nothing for an empty text, a plain cancel for an untouched one, the PATCH otherwise. */
export function planSubmit(original: string, composerText: string): SubmitPlan {
  const text = composerText.trim();
  if (!text) return { kind: "empty" };
  if (text === original.trim()) return { kind: "unchanged" };
  return { kind: "save", text };
}

/** The short quote of the original in the «Редактирование сообщения» banner: one line, whitespace collapsed, cut with an ellipsis. */
export function editQuote(text: string, max = 120): string {
  const one = text.replace(/\s+/g, " ").trim();
  return one.length > max ? `${one.slice(0, max - 1).trimEnd()}…` : one;
}

export type ComposerPart = { k: "text"; v: string } | { k: "br" } | { k: "emoji"; v: string };

/**
 * A message text as the pieces the composer is built from: text runs, line breaks (<br>) and the custom emoji
 * `:slug:` (only slugs in `customSlugs`; any other `:word:` stays plain text). getInputText() turns these back into the same string.
 */
export function composerParts(text: string, customSlugs: ReadonlySet<string>): ComposerPart[] {
  const out: ComposerPart[] = [];
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  lines.forEach((line, i) => {
    if (i > 0) out.push({ k: "br" });
    let rest = line;
    let buf = "";
    while (rest.length) {
      const m = /^:([A-Za-z0-9_-]+):/.exec(rest);
      if (m && customSlugs.has(m[1])) {
        if (buf) out.push({ k: "text", v: buf });
        buf = "";
        out.push({ k: "emoji", v: m[0] });
        rest = rest.slice(m[0].length);
      } else {
        buf += rest[0];
        rest = rest.slice(1);
      }
    }
    if (buf) out.push({ k: "text", v: buf });
  });
  return out;
}
