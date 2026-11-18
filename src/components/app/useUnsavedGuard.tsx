"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useT } from "@/lib/i18n/client";
import { registerBackGuard } from "@/lib/app-back";
import { useAppUi } from "./useAppUi";
import { useBackLayer } from "./useBackLayer";

/**
 * A form with unsaved edits asks «Отменить изменения?» before «Назад» (the generic button of the app header and the Android hardware button, both go through
 * window.FomoBack, see AppBackHandler) leaves it. Only in the app UI; elsewhere the hook does nothing and renders nothing.
 *   const unsaved = useUnsavedGuard(dirty);   ...   {unsaved.dialog}   ...   unsaved.release() right before the form navigates away after a successful save.
 * Not covered: the dock tabs and the browser's own history buttons (Alt+←, a swipe in a PWA) leave without asking.
 */
export function useUnsavedGuard(dirty: boolean): { dialog: ReactNode; release: () => void } {
  const appUi = useAppUi();
  const [open, setOpen] = useState(false);
  const released = useRef(false);
  const armed = appUi && dirty && !released.current;

  useEffect(() => {
    if (!armed) return;
    return registerBackGuard(() => {
      if (released.current) return false;
      setOpen(true);
      return true;
    });
  }, [armed]);

  const close = useCallback(() => setOpen(false), []);
  useBackLayer(open, close);

  const discard = useCallback(() => {
    released.current = true;
    setOpen(false);
    // the guard is off now: the same Back, again, leaves the screen (after the dialog's layer is gone)
    window.setTimeout(() => {
      const fb = (window as unknown as { FomoBack?: () => boolean }).FomoBack;
      if (fb) fb();
      else window.history.back();
    }, 50);
  }, []);
  const release = useCallback(() => {
    released.current = true;
    setOpen(false);
  }, []);

  const dialog = open ? <UnsavedDialog onDiscard={discard} onStay={close} /> : null;
  return { dialog, release };
}

function UnsavedDialog({ onDiscard, onStay }: { onDiscard: () => void; onStay: () => void }) {
  const { t } = useT();
  return (
    <div className="app-confirm" role="alertdialog" aria-modal="true" aria-labelledby="app-confirm-title" data-back-ignore>
      <div className="app-confirm-back" onClick={onStay} />
      <div className="app-confirm-card">
        <div className="app-confirm-title" id="app-confirm-title">
          {t("appui.unsaved.title")}
        </div>
        <div className="app-confirm-text">{t("appui.unsaved.text")}</div>
        <button type="button" className="app-confirm-btn" data-tone="danger" onClick={onDiscard}>
          {t("appui.unsaved.discard")}
        </button>
        <button type="button" className="app-confirm-btn" onClick={onStay} autoFocus>
          {t("appui.unsaved.stay")}
        </button>
      </div>
    </div>
  );
}
