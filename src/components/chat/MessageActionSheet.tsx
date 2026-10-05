"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Touch counterpart of the desktop hover toolbar (ChatRoom) and hover emoji
 * row (DM): there is no hover on a phone, so a tap on a message selects it and
 * this bottom sheet offers its quick reactions and actions.
 *
 * - Fixed to the bottom of the screen and safe-area aware, so it can never
 *   overflow the viewport (the old absolutely-positioned picker could).
 * - Reaction and action buttons are 48/44px tall with gaps, so a finger cannot
 *   hit a neighbour.
 * - Ghost-click guard: nothing reacts to a click for ~350 ms after the sheet
 *   mounts, so the tap that opened it can never also pick something.
 * - It is only mounted while a message is selected (never hidden with
 *   opacity), so there are no invisible buttons to catch stray taps.
 */

export interface SheetAction {
  key: string;
  label: string;
  icon: ReactNode;
  onSelect: () => void;
  danger?: boolean;
}

interface Props {
  author: string;
  preview: string;
  reactions: string[];
  /** Emojis the current user has already put on this message. */
  mine: string[];
  reactionLabel: string;
  closeLabel: string;
  actions: SheetAction[];
  onReact: (emoji: string) => void;
  onClose: () => void;
}

const ARM_DELAY_MS = 350;

/** True when the interaction is a finger/pen, or the primary pointer is coarse. */
export function isTouchInteraction(pointerType?: string): boolean {
  if (pointerType === "touch" || pointerType === "pen") return true;
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(pointer: coarse)").matches;
}

/** Taps on these keep their own behaviour and never select the message. */
export function isInteractiveTarget(target: EventTarget | null): boolean {
  return target instanceof Element && !!target.closest("a, button, img, video, audio, input, textarea, select, [data-no-select]");
}

export default function MessageActionSheet({
  author, preview, reactions, mine, reactionLabel, closeLabel, actions, onReact, onClose,
}: Props) {
  const armedAt = useRef(0);
  useEffect(() => {
    armedAt.current = Date.now() + ARM_DELAY_MS;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const armed = () => Date.now() >= armedAt.current;
  const guarded = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!armed()) { e.preventDefault(); return; }
    fn();
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[80]" role="dialog" aria-modal="true" aria-label={reactionLabel}>
      <div
        className="absolute inset-0 bg-black/30"
        aria-label={closeLabel}
        onClick={guarded(onClose)}
        onTouchMove={() => { if (armed()) onClose(); }}
        onWheel={() => { if (armed()) onClose(); }}
      />
      <div
        className="absolute inset-x-0 bottom-0 mx-auto w-full max-w-md bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 rounded-t-2xl shadow-2xl px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
        style={{ touchAction: "manipulation" }}
      >
        <div className="mb-3 px-1 min-w-0">
          <div className="text-xs font-semibold text-green-600 dark:text-green-400 truncate">{author}</div>
          {preview && <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{preview}</div>}
        </div>

        <div className="grid grid-cols-6 gap-2" aria-label={reactionLabel}>
          {reactions.map((emoji) => {
            const active = mine.includes(emoji);
            return (
              <button
                key={emoji}
                type="button"
                onClick={guarded(() => onReact(emoji))}
                className={`h-12 rounded-xl text-2xl leading-none flex items-center justify-center border transition active:scale-95 ${
                  active
                    ? "bg-green-100 dark:bg-green-900/40 border-green-400 dark:border-green-700"
                    : "bg-gray-100 dark:bg-gray-800 border-transparent"
                }`}
              >
                {emoji}
              </button>
            );
          })}
        </div>

        {actions.length > 0 && (
          <div className="grid grid-cols-2 gap-2 mt-3">
            {actions.map((a) => (
              <button
                key={a.key}
                type="button"
                onClick={guarded(a.onSelect)}
                className={`min-h-11 px-3 rounded-xl flex items-center gap-2 text-sm font-medium border border-gray-200 dark:border-gray-700 active:bg-gray-100 dark:active:bg-gray-800 transition ${
                  a.danger ? "text-red-600 dark:text-red-400" : "text-gray-700 dark:text-gray-200"
                }`}
              >
                <span className="shrink-0 w-5 flex items-center justify-center">{a.icon}</span>
                <span className="truncate">{a.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
