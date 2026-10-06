"use client";

import { useCallback, useEffect, useState } from "react";
import { useT } from "@/lib/i18n/client";
import { DM_PIN_MAX } from "@/lib/app-chat";
import AppIcon from "../AppIcon";
import AppSheet from "./AppSheet";
import type { useDmMarks } from "./useChatPrefs";
import type { Conversation } from "./useAppChatData";

/** The old page's right-click menu of a dialog (star the person, pin, mute, remove from contacts), as a design sheet opened by a long press. */
export default function AppDialogSheet({ conv, marks, onClose, flash }: { conv: Conversation; marks: ReturnType<typeof useDmMarks>; onClose: () => void; flash: (m: string) => void }) {
  const { t } = useT();
  const other = conv.otherUser;
  const [isContact, setIsContact] = useState<boolean | null>(null);
  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/contacts", { cache: "no-store" });
      if (r.ok && other) setIsContact(((await r.json()) as { user: { id: string } }[]).some((c) => c.user.id === other.id));
    } catch {
      /* the row stays hidden */
    }
  }, [other]);
  useEffect(() => {
    void load();
  }, [load]);
  const pinned = marks.pinned.includes(conv.id);
  const muted = marks.muted.includes(conv.id);
  const fav = !!other && marks.favorites.includes(other.id);
  return (
    <AppSheet
      title={other?.displayName || t("msg.deletedUser")}
      onClose={onClose}
      doneLabel={t("appui.chat.done")}
      sections={[
        {
          key: "dlg",
          rows: [
            ...(other ? [{ key: "fav", label: fav ? t("msg.removeFav") : t("msg.addFav"), icon: <AppIcon name="star" size={18} stroke={1.8} />, onClick: () => marks.toggleFavorite(other.id) }] : []),
            { key: "pin", label: `${pinned ? t("msg.unpin") : t("msg.pin")}${!pinned && marks.pinned.length >= DM_PIN_MAX ? ` (${t("msg.max5")})` : ""}`, icon: <AppIcon name="pin" size={18} stroke={1.8} />, check: pinned, onClick: () => { if (!marks.togglePinned(conv.id)) flash(t("msg.max5")); } },
            { key: "mute", label: muted ? t("msg.enableNotif") : t("msg.disableNotif"), icon: <AppIcon name={muted ? "bell" : "bellOff"} size={18} stroke={1.8} />, onClick: () => marks.toggleMuted(conv.id) },
            ...(other && isContact
              ? [
                  {
                    key: "rm",
                    label: t("appui.chat.removeContact"),
                    icon: <AppIcon name="userMinus" size={18} stroke={1.8} />,
                    color: "var(--app-red)",
                    onClick: async () => {
                      await fetch(`/api/contacts?contactId=${encodeURIComponent(other.id)}`, { method: "DELETE" }).catch(() => {});
                      await load();
                    },
                  },
                ]
              : []),
          ],
        },
      ]}
    />
  );
}
