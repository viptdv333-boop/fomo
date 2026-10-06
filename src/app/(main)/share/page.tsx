"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import AuthGuard from "@/components/layout/AuthGuard";
import { useT } from "@/lib/i18n/client";
import { peekSharedFile, stashSharedFile } from "@/lib/clipboard-files";
import { onNativeShare } from "@/lib/native-app";

interface Dest {
  key: string;
  title: string;
  sub?: string;
  href: string;
  group: "fav" | "dm" | "group" | "topic";
}

/** Where the file shared into the app ("Share → FOMO") goes: pick a chat, the chat opens with it attached. */
function ShareInner() {
  const { t } = useT();
  const router = useRouter();
  const { data: session } = useSession();
  const [file, setFile] = useState<{ name: string; type: string; url: string } | null | undefined>(undefined);
  const [q, setQ] = useState("");
  const [dests, setDests] = useState<Dest[]>([]);
  const [shareText, setShareText] = useState("");
  const [copied, setCopied] = useState(false);
  // bumped when the Android app has just handed us a new file (see SharePage)
  const [tick, setTick] = useState(0);

  useEffect(() => {
    // text shared from the Android app arrives in the query string
    const q = new URLSearchParams(window.location.search);
    setShareText([q.get("title"), q.get("text")].filter(Boolean).join("\n").slice(0, 8000));
    const on = () => setTick((n) => n + 1);
    window.addEventListener("fomo-share-stashed", on);
    return () => window.removeEventListener("fomo-share-stashed", on);
  }, []);

  useEffect(() => {
    let url = "";
    let dead = false;
    peekSharedFile().then((f) => {
      if (dead) return;
      if (!f) return setFile(null);
      url = URL.createObjectURL(f);
      setFile({ name: f.name, type: f.type, url });
    });
    return () => {
      dead = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [tick]);

  useEffect(() => {
    if (!session?.user?.id) return;
    const get = (u: string) => fetch(u).then((r) => (r.ok ? r.json() : [])).catch(() => []);
    Promise.all([get("/api/chat/favorites"), get("/api/messages/conversations"), get("/api/rooms"), get("/api/assets")]).then(([favs, convs, rooms, assets]) => {
      const out: Dest[] = [];
      const seen = new Set<string>();
      out.push({ key: "general", title: t("share.general"), href: "/chat?room=general&shared=1", group: "topic" });
      for (const f of Array.isArray(favs) ? favs : []) {
        if (seen.has(f.roomId)) continue;
        seen.add(f.roomId);
        out.push({ key: "fav" + f.roomId, title: f.name, href: `/chat?room=${f.roomId}&shared=1`, group: "fav" });
      }
      for (const c of Array.isArray(convs) ? convs : []) {
        if (!c.otherUser) continue;
        out.push({ key: "dm" + c.id, title: c.otherUser.displayName, sub: c.lastMessage?.text?.slice(0, 40), href: `/messages?conversation=${c.id}&shared=1`, group: "dm" });
      }
      for (const r of Array.isArray(rooms) ? rooms : []) out.push({ key: "g" + r.id, title: r.name, href: `/chat?room=${r.id}&shared=1`, group: "group" });
      for (const a of Array.isArray(assets) ? assets : []) {
        if (!a.chatRoom || a.chatRoom.isArchived || seen.has(a.chatRoom.id)) continue;
        out.push({ key: "t" + a.chatRoom.id, title: a.name, sub: a.category?.name, href: `/chat?room=${a.chatRoom.id}&shared=1`, group: "topic" });
      }
      setDests(out);
    });
  }, [session?.user?.id, t]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return dests.filter((d) => !s || d.title.toLowerCase().includes(s) || (d.sub || "").toLowerCase().includes(s));
  }, [dests, q]);

  const groups: { id: Dest["group"]; label: string }[] = [
    { id: "fav", label: t("share.fav") },
    { id: "dm", label: t("share.dm") },
    { id: "group", label: t("share.groups") },
    { id: "topic", label: t("share.topics") },
  ];

  return (
    <div className="max-w-lg mx-auto w-full flex flex-col gap-3 min-h-0">
      <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">{t("share.title")}</h1>
      {file === undefined ? null : file ? (
        <div className="flex items-center gap-3 rounded-xl border border-gray-200 dark:border-gray-700 p-2 bg-white dark:bg-gray-900">
          {file.type.startsWith("image/") ? <img src={file.url} alt="" className="w-14 h-14 rounded-lg object-cover" /> : <span className="w-14 h-14 flex items-center justify-center text-2xl">📎</span>}
          <span className="text-sm text-gray-700 dark:text-gray-200 truncate">{file.name}</span>
        </div>
      ) : shareText ? null : (
        <p className="text-sm text-amber-600">{t("share.noFile")}</p>
      )}
      {shareText && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-3 bg-white dark:bg-gray-900">
          <p className="text-sm text-gray-700 dark:text-gray-200 whitespace-pre-wrap line-clamp-6 [overflow-wrap:anywhere]">{shareText}</p>
          <button
            type="button"
            className="mt-2 text-sm font-semibold text-green-600"
            onClick={() => {
              navigator.clipboard
                ?.writeText(shareText)
                .then(() => setCopied(true))
                .catch(() => {});
            }}
          >
            {copied ? t("share.copied") : t("share.copyText")}
          </button>
        </div>
      )}
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t("share.search")}
        className="w-full px-4 py-2.5 border rounded-xl text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
      />
      <div className="flex flex-col gap-4 overflow-y-auto pb-6">
        {groups.map((g) => {
          const list = shown.filter((d) => d.group === g.id);
          if (list.length === 0) return null;
          return (
            <div key={g.id}>
              <div className="text-xs uppercase tracking-wide text-gray-400 mb-1 px-1">{g.label}</div>
              <div className="rounded-xl bg-white dark:bg-gray-900 divide-y divide-gray-100 dark:divide-gray-800 shadow-sm">
                {list.map((d) => (
                  <button key={d.key} onClick={() => router.push(d.href)} className="w-full text-left px-4 py-3 active:bg-gray-100 dark:active:bg-gray-800">
                    <div className="text-[15px] text-gray-900 dark:text-gray-100 truncate">{d.title}</div>
                    {d.sub && <div className="text-xs text-gray-400 truncate">{d.sub}</div>}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function SharePage() {
  // Android app: files from the system "Share" sheet. Taken here (outside AuthGuard) so they are kept even while the
  // user still has to sign in; ShareInner re-reads the cache when it hears "fomo-share-stashed".
  useEffect(
    () =>
      onNativeShare((s) => {
        const first = s.files[0];
        if (first) stashSharedFile(first).then(() => window.dispatchEvent(new Event("fomo-share-stashed")));
      }),
    []
  );
  return (
    <AuthGuard>
      <ShareInner />
    </AuthGuard>
  );
}
