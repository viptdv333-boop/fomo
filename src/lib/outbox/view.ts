import type { ViewMsg } from "@/components/app/chat/AppThreadParts";
import type { OutboxItem } from "./outbox";

/** What the composer stores in `preview` of a message item, so the unsent bubble can be drawn before (and after a restart without) the server. */
export interface MessagePreview {
  text?: string;
  fileUrl?: string;
  fileName?: string;
  fileType?: string;
  /** «Name: quoted text…» line of a reply */
  reply?: string;
}

/** An outbox message as the bubble list draws it: mine, with a clock while it waits, «Не отправлено» when the server refused it. */
export function pendingToView(it: OutboxItem): ViewMsg {
  const p = (it.preview || {}) as MessagePreview;
  return {
    id: "pending:" + it.clientId,
    createdAt: new Date(it.createdAt).toISOString(),
    mine: true,
    who: null,
    text: p.text || "",
    deleted: false,
    edited: false,
    reply: p.reply || null,
    file: p.fileUrl ? { url: p.fileUrl, name: p.fileName ?? null, type: p.fileType ?? null } : null,
    reactions: null,
    pending: it.status === "failed" ? "failed" : it.status === "sent" ? undefined : "queued",
    pendingId: it.clientId,
  };
}
