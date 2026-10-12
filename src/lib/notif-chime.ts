// When the (in the app UI hidden) bell chimes. Pure: scripts/check-notif-chime.ts runs it.
import { tabForNotifType } from "@/lib/app-badges";

export interface ChimeRow {
  type: string;
}

/**
 * Should the notification chime of NotificationBell play for this reload of the bell?
 *  - `prev` is the unread count of the previous reload, -1 = this is the FIRST reload of this bell instance (page load, remount): that only sets the
 *    baseline. Unread rows that were already there are not news; chiming for them meant a sound at every app start and at every remount of the bell.
 *  - the count must have grown.
 *  - outside the app UI the bell is on screen and its list shows what happened: chime for any growth.
 *  - in the app UI the bell is hidden, the trace of an event is a dock badge: every well-formed type lights a tab (the ones without a section of their own,
 *    new_follower, payment, system ..., light the Профиль tab, whose «Уведомления» list shows them), so the chime follows one rule for all of them: a
 *    row with a tab chimes; junk without a tab (tabForNotifType null) does not. When the Android app holds a push token the system banner of the push
 *    already rings for everything but the chat (src/lib/fcm.ts / FcmService.kt: chat messages are not bannered while the app is open), so only chat
 *    rows chime.
 * `fresh` = the unread rows of this reload that the bell had not seen before.
 */
export function shouldChime(input: { prev: number; next: number; fresh: readonly ChimeRow[]; appUi: boolean; nativePush: boolean }): boolean {
  const { prev, next, fresh, appUi, nativePush } = input;
  if (prev < 0) return false;
  if (!(next > prev)) return false;
  if (!appUi) return true;
  return fresh.some((n) => {
    const tab = tabForNotifType(n.type);
    if (!tab) return false;
    return nativePush ? tab === "chat" : true;
  });
}
