"use client";

import { useCallback, useEffect, useState } from "react";
import AppIcon from "../AppIcon";
import AppSheet, { Sections, type SheetSection } from "../chat/AppSheet";
import { deleteGroup, inviteGroup, leaveGroup } from "../chat/groupActions";
import { useProf } from "./ProfileCtx";
import { Loading, ScreenFrame } from "./parts";

interface Room {
  id: string;
  name: string;
  description: string | null;
  membersCount: number;
  isOwner: boolean;
  inviteToken?: string;
}

/** «Комнаты» (the design's `rooms`): my private groups (invite link, delete / leave), «Создать группу». The old «Комнаты» tab of the profile. */
export default function RoomsScreen() {
  const { t, open, flash } = useProf();
  const [rooms, setRooms] = useState<Room[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/rooms");
      const j = r.ok ? await r.json() : [];
      setRooms(Array.isArray(j) ? j : []);
    } catch {
      setRooms((prev) => prev ?? []);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function create() {
    const n = name.trim();
    if (!n) {
      flash(t("chat2.enterName"));
      return;
    }
    setBusy(true);
    try {
      const r = await fetch("/api/rooms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: n, description: desc.trim() || undefined }) });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        flash(data?.error || t("chat2.createError"));
      } else {
        setCreating(false);
        setName("");
        setDesc("");
        await load();
        // as the design: the new group's invite link is offered right away
        if (data?.inviteToken) void inviteGroup({ name: data.name || n, inviteToken: data.inviteToken }, t, flash);
      }
    } catch {
      flash(t("chat2.createError"));
    }
    setBusy(false);
  }

  const sections: SheetSection[] = [];
  if (rooms && rooms.length)
    sections.push({
      key: "mine",
      title: t("appui.chat.myGroups"),
      rows: rooms.map((r) => ({
        key: r.id,
        label: r.name,
        sub: [t("appui.chat.groupSub", { n: r.membersCount, role: r.isOwner ? t("appui.chat.owner") : t("appui.chat.member") }), r.description].filter(Boolean).join(" · "),
        onClick: () => open(`/chat?room=${encodeURIComponent(r.id)}`),
        actions: [
          ...(r.isOwner && r.inviteToken ? [{ label: t("chat2.link"), onClick: () => void inviteGroup(r, t, flash) }] : []),
          r.isOwner
            ? { label: t("common.delete"), tone: "danger" as const, onClick: () => void deleteGroup(r.id, t).then((ok) => void (ok && load())) }
            : { label: t("appui.chat.leave"), tone: "danger" as const, onClick: () => void leaveGroup(r, t).then((ok) => void (ok && load())) },
        ],
      })),
    });
  sections.push({
    key: "create",
    rows: [{ key: "new", label: t("chat2.createGroup"), color: "var(--app-green-tx)", icon: <AppIcon name="plus" size={18} stroke={1.8} />, onClick: () => setCreating(true) }],
  });

  return (
    <ScreenFrame title={t("profile2.tabRooms")} intro={t("appui.chat.roomsIntro")}>
      {rooms === null ? <Loading label={t("common.loading")} /> : <Sections sections={sections} />}
      {rooms !== null && rooms.length === 0 && <div className="ap-note">{t("profile2.roomsEmpty")}</div>}
      {creating && (
        <AppSheet
          title={t("chat2.newPrivateGroup")}
          onClose={() => setCreating(false)}
          left={{ label: t("common.cancel"), onClick: () => setCreating(false) }}
          right={null}
          doneLabel={t("appui.chat.done")}
          intro={t("chat2.privateGroupHint")}
          sections={[
            {
              key: "f",
              rows: [
                { key: "n", label: t("chat2.nameLabel"), field: { value: name, ph: t("chat2.namePlaceholder"), onChange: setName, maxLength: 60 } },
                { key: "d", label: t("chat2.descriptionOptional"), field: { value: desc, ph: t("chat2.descriptionPlaceholder"), onChange: setDesc, maxLength: 300 } },
              ],
            },
          ]}
          btn={{ label: busy ? t("chat2.creating") : t("chat2.createGroup"), disabled: busy || !name.trim(), onClick: () => void create() }}
        />
      )}
    </ScreenFrame>
  );
}
