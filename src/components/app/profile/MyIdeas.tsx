"use client";

import { useCallback, useEffect, useState } from "react";
import { agoLabel } from "@/lib/app-ui";
import { ideaSubLine } from "@/lib/app-profile";
import { likeLabel, unreadLabel } from "@/lib/app-unread";
import { UnreadStripView } from "../AppUnreadStrip";
import { useUnreadByIdea } from "../useUnreadByIdea";
import { Sections, type SheetSection } from "../chat/AppSheet";
import { useProf } from "./ProfileCtx";
import { Loading, ScreenFrame } from "./parts";

interface MyIdea {
  id: string;
  title: string;
  voteScore?: number;
  createdAt: string;
  moderationStatus?: string;
}

/** Every page of the author's ideas (/api/ideas is paginated, limit 100 at most), as the old tab did. */
async function fetchAllMyIdeas(authorId: string): Promise<MyIdea[]> {
  const all: MyIdea[] = [];
  for (let page = 1; page < 200; page++) {
    const res = await fetch(`/api/ideas?authorId=${authorId}&page=${page}&limit=100`);
    if (!res.ok) break;
    const data = await res.json();
    const chunk: MyIdea[] = data?.data ?? data?.ideas ?? (Array.isArray(data) ? data : []);
    if (chunk.length === 0) break;
    all.push(...chunk);
    if (page >= (data?.totalPages ?? 1)) break;
  }
  return all;
}

/** «Мои идеи» (the design's `myideas`): every idea with «В архив» / «Вернуть», «Редактировать», «Удалить» and «Удалить все». */
export default function MyIdeas() {
  const { t, user, locale, open, flash } = useProf();
  const uid = user?.id;
  const [ideas, setIdeas] = useState<MyIdea[] | null>(null);
  const [busy, setBusy] = useState(false);
  const unread = useUnreadByIdea(); // red count of unread comments under each idea

  const load = useCallback(async () => {
    if (!uid) return;
    try {
      setIdeas(await fetchAllMyIdeas(uid));
    } catch {
      setIdeas((prev) => prev ?? []);
    }
  }, [uid]);
  useEffect(() => {
    void load();
  }, [load]);

  async function toggleArchive(i: MyIdea) {
    const next = i.moderationStatus === "archived" ? "published" : "archived";
    const res = await fetch(`/api/ideas/${i.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ moderationStatus: next }) });
    if (res.ok) setIdeas((prev) => (prev ? prev.map((x) => (x.id === i.id ? { ...x, moderationStatus: next } : x)) : prev));
    else flash(t("appprof.actionFailed"));
  }
  async function remove(i: MyIdea) {
    if (!window.confirm(t("profile2.confirmDeleteIdea"))) return;
    const res = await fetch(`/api/ideas/${i.id}`, { method: "DELETE" });
    if (res.ok) {
      setIdeas((prev) => (prev ? prev.filter((x) => x.id !== i.id) : prev));
      flash(t("appprof.ideaDeleted"));
    } else window.alert(t("profile2.deleteIdeaFailed"));
  }
  async function removeAll() {
    if (!uid || busy) return;
    // refetch across all pages first: what is on screen may not be everything
    const everything = await fetchAllMyIdeas(uid);
    const total = everything.length;
    if (total === 0) return;
    if (!window.confirm(t("profile2.confirmDeleteAll", { total }))) return;
    setBusy(true);
    // sequentially: parallel deletes were silently failing (session race / DB pool); serial surfaces the first failure
    let ok = 0;
    let firstError = "";
    for (const idea of everything) {
      try {
        const res = await fetch(`/api/ideas/${idea.id}`, { method: "DELETE" });
        if (res.ok) {
          ok++;
          setIdeas((prev) => (prev ? prev.filter((x) => x.id !== idea.id) : prev));
        } else if (!firstError) {
          const body = await res.text().catch(() => "");
          firstError = `HTTP ${res.status} ${body.slice(0, 120)}`;
        }
      } catch (e) {
        if (!firstError) firstError = e instanceof Error ? e.message : String(e);
      }
    }
    setBusy(false);
    if (ok < total) window.alert(t("profile2.deleteAllPartial", { ok, total, error: firstError || t("profile2.errorUnknownShort") }));
    else flash(t("appprof.allIdeasDeleted"));
    void load();
  }

  // the strip of this screen: what is unread under MY ideas (comments, new-post marks, likes); one tap opens the first of them
  const mine = { n: 0, p: 0, l: 0, first: null as string | null, firstComment: null as string | null };
  for (const i of ideas ?? []) {
    const e = unread.byIdea[i.id];
    if (!e) continue;
    mine.n += e.c;
    mine.p += e.p;
    mine.l += e.l;
    if (mine.first === null && e.c + e.p + e.l > 0) mine.first = i.id;
  }

  const sections: SheetSection[] = [];
  if (ideas && ideas.length > 0) {
    sections.push({
      key: "list",
      footer: t("appprof.ideasFoot"),
      rows: ideas.map((i) => ({
        key: i.id,
        label: i.title,
        sub: ideaSubLine(i.voteScore ?? 0, agoLabel(i.createdAt, locale), i.moderationStatus === "archived" ? t("appprof.inArchive") : i.moderationStatus === "hidden" ? t("appprof.hiddenIdea") : null),
        badge: unreadLabel(unread.byIdea[i.id]) || undefined,
        value: likeLabel(unread.byIdea[i.id]) ? `♥ ${likeLabel(unread.byIdea[i.id])}` : undefined,
        valueColor: "var(--app-like)",
        valueWeight: 700,
        onClick: () => open(`/ideas/${i.id}`),
        actions: [
          { label: t("appprof.edit"), onClick: () => open(`/ideas/${i.id}/edit`) },
          ...(i.moderationStatus === "hidden" ? [] : [{ label: i.moderationStatus === "archived" ? t("appprof.unarchive") : t("appprof.archive"), onClick: () => void toggleArchive(i) }]),
          { label: t("common.delete"), tone: "danger" as const, onClick: () => void remove(i) },
        ],
      })),
    });
    sections.push({ key: "all", rows: [{ key: "all", label: t("profile2.deleteAll"), color: "var(--app-red)", onClick: () => void removeAll() }] });
  }

  return (
    <ScreenFrame title={t("profile.ideas")}>
      {ideas === null ? (
        <Loading label={t("common.loading")} />
      ) : ideas.length === 0 ? (
        <div className="ac-empty">{t("profile2.noIdeas")}</div>
      ) : (
        <>
          <UnreadStripView bucket={mine} scope="myideas" />
          <Sections sections={sections} />
        </>
      )}
    </ScreenFrame>
  );
}
