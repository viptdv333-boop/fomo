"use client";

import { useEffect, useMemo, useState } from "react";
import { useT } from "@/lib/i18n/client";
import { initials } from "@/lib/app-chat";
import AppSheet, { type SheetRow } from "./AppSheet";

interface Person {
  id: string;
  displayName: string;
  fomoId: string | null;
  avatarUrl: string | null;
}

/** The design's «Новый чат» sheet: a search field and the people one can start a conversation with (contacts first, then everyone with DMs on). */
export default function AppNewChatSheet({ onClose, onPick, myId }: { onClose: () => void; onPick: (userId: string) => void; myId: string | undefined }) {
  const { t } = useT();
  const [q, setQ] = useState("");
  const [people, setPeople] = useState<Person[]>([]);
  const [contactIds, setContactIds] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    void Promise.all([
      fetch("/api/users/dm-enabled").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/contacts").then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([all, contacts]) => {
        if (!alive) return;
        setPeople((Array.isArray(all) ? all : []).filter((u: Person) => u.id !== myId));
        setContactIds(new Set((Array.isArray(contacts) ? contacts : []).map((c: { user: { id: string } }) => c.user.id)));
      })
      .catch(() => {})
      .finally(() => alive && setLoaded(true));
    return () => {
      alive = false;
    };
  }, [myId, tick]);

  const sections = useMemo(() => {
    const needle = q.trim().toLowerCase().replace(/^#/, "");
    const match = (u: Person) => !needle || u.displayName.toLowerCase().includes(needle) || (u.fomoId || "").toLowerCase().includes(needle);
    const row = (u: Person): SheetRow => ({
      key: u.id,
      label: u.displayName,
      sub: u.fomoId ? `#${u.fomoId}` : undefined,
      icon: u.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={u.avatarUrl} alt="" style={{ width: "100%", height: "100%", borderRadius: 8, objectFit: "cover" }} />
      ) : (
        <span>{initials(u.displayName)}</span>
      ),
      onClick: () => onPick(u.id),
      // the old «Добавить контакт» list: add a person (or drop them) without opening a chat
      actions: [
        contactIds.has(u.id)
          ? { label: t("appui.chat.removeContact"), tone: "danger" as const, onClick: () => void fetch(`/api/contacts?contactId=${encodeURIComponent(u.id)}`, { method: "DELETE" }).then(() => setTick((n) => n + 1)) }
          : { label: t("msg.addContact"), onClick: () => void fetch("/api/contacts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contactId: u.id }) }).then(() => setTick((n) => n + 1)) },
      ],
    });
    const shown = people.filter(match);
    const contacts = shown.filter((u) => contactIds.has(u.id));
    const rest = shown.filter((u) => !contactIds.has(u.id));
    const out = [];
    if (contacts.length) out.push({ key: "contacts", title: t("appui.chat.contacts"), rows: contacts.map(row) });
    if (rest.length) out.push({ key: "people", title: contacts.length ? t("appui.chat.people") : null, rows: rest.map(row) });
    return out;
  }, [people, contactIds, q, t, onPick]);

  return (
    <AppSheet
      title={t("msg.newChatTitle")}
      onClose={onClose}
      doneLabel={t("appui.chat.done")}
      height="full"
      search={{ value: q, ph: t("appui.chat.userSearch"), onChange: setQ }}
      sections={sections}
    >
      {loaded && sections.length === 0 && <div className="ac-empty">{t("appui.chat.nothing")}</div>}
      {!loaded && <div className="ac-empty">{t("common.loading")}</div>}
    </AppSheet>
  );
}
