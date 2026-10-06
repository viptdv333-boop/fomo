"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n/client";
import AppIcon from "../AppIcon";
import AppSheet, { Sections, type SheetSection } from "./AppSheet";
import type { PrivateRoom } from "@/lib/app-chat";
import { deleteGroup, inviteGroup, leaveGroup } from "./groupActions";

/** The design's pushed «Комнаты» screen: my private groups (invite link, delete / leave) and «Создать группу». */
export default function AppGroupsScreen({
  rooms,
  onBack,
  onOpen,
  onChanged,
  flash,
}: {
  rooms: PrivateRoom[];
  onBack: () => void;
  onOpen: (id: string) => void;
  onChanged: () => void;
  flash: (m: string) => void;
}) {
  const { t } = useT();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);

  const invite = (r: PrivateRoom) => inviteGroup(r, t, flash);
  async function remove(r: PrivateRoom) {
    if (await deleteGroup(r.id, t)) onChanged();
  }
  async function leave(r: PrivateRoom) {
    if (await leaveGroup(r, t)) onChanged();
  }

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
        onChanged();
        onOpen(data.id);
      }
    } catch {
      flash(t("chat2.createError"));
    }
    setBusy(false);
  }

  const sections: SheetSection[] = [];
  if (rooms.length)
    sections.push({
      key: "mine",
      title: t("appui.chat.myGroups"),
      rows: rooms.map((r) => ({
        key: r.id,
        label: r.name,
        sub: t("appui.chat.groupSub", { n: r.membersCount, role: r.isOwner ? t("appui.chat.owner") : t("appui.chat.member") }),
        onClick: () => onOpen(r.id),
        actions: [
          ...(r.isOwner && r.inviteToken ? [{ label: t("chat2.link"), onClick: () => void invite(r) }] : []),
          r.isOwner ? { label: t("common.delete"), tone: "danger" as const, onClick: () => void remove(r) } : { label: t("appui.chat.leave"), tone: "danger" as const, onClick: () => void leave(r) },
        ],
      })),
    });
  sections.push({
    key: "create",
    rows: [{ key: "new", label: t("chat2.createGroup"), color: "var(--app-green-tx)", icon: <AppIcon name="plus" size={18} stroke={1.8} />, onClick: () => setCreating(true) }],
  });

  return (
    <div className="ac">
      <div className="ac-nav">
        <button type="button" className="ac-back" onClick={onBack}>
          <AppIcon name="chevL" size={22} stroke={1.8} />
          <span>{t("nav.chat")}</span>
        </button>
        <div className="ac-navtitle">{t("appui.chat.rooms")}</div>
        <div />
      </div>
      <div className="ac-page">
        <div className="ac-intro">{t("appui.chat.roomsIntro")}</div>
        <Sections sections={sections} />
      </div>
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
    </div>
  );
}
