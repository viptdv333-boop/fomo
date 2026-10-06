"use client";

type T = (key: string, vars?: Record<string, string | number>) => string;

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.cssText = "position:fixed;opacity:0;left:0;top:0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

/** Invite link of a private group: the system share sheet when there is one, otherwise the clipboard. */
export async function inviteGroup(r: { name: string; inviteToken?: string }, t: T, flash: (m: string) => void) {
  if (!r.inviteToken) return;
  const url = `${window.location.origin}/rooms/join/${r.inviteToken}`;
  const text = t("chat2.inviteShareText", { name: r.name });
  try {
    if (typeof navigator.share === "function") {
      await navigator.share({ title: r.name, text, url });
      return;
    }
  } catch (e) {
    if ((e as Error)?.name === "AbortError") return;
  }
  if (await copyText(url)) flash(t("appui.chat.linkCopied"));
}

/** Owner deletes the group (asks first, as the old page did). True when it went through. */
export async function deleteGroup(id: string, t: T): Promise<boolean> {
  if (!window.confirm(t("chat2.confirmDeleteGroup"))) return false;
  const r = await fetch(`/api/rooms/${id}`, { method: "DELETE" }).catch(() => null);
  return !!r?.ok;
}

/** A member leaves the group. True when it went through. */
export async function leaveGroup(r: { id: string; name: string }, t: T): Promise<boolean> {
  if (!window.confirm(t("appui.chat.leaveConfirm", { name: r.name }))) return false;
  const res = await fetch(`/api/rooms/${r.id}/leave`, { method: "POST" }).catch(() => null);
  return !!res?.ok;
}
