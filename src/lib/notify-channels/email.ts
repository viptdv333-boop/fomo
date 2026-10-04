import { isEmailConfigured, sendNotificationEmail } from "@/lib/email";
import { suppressedNote, absoluteLink, type AdapterDeps, type ChannelMessage, type ChannelRowLite, type SendResult } from "./types";

/** E-mail through the same Resend account as the sign-up codes (src/lib/email.ts). */
export function isConfigured(): boolean {
  return isEmailConfigured();
}

export async function send(row: ChannelRowLite, msg: ChannelMessage, deps?: AdapterDeps): Promise<SendResult> {
  if (!row.address) return { ok: false, error: "no address", permanent: true };
  return sendNotificationEmail(
    row.address,
    { title: msg.title, body: msg.body, link: absoluteLink(msg.link, msg.locale), locale: msg.locale, footerNote: suppressedNote(msg) || undefined },
    deps?.fetch ?? fetch
  );
}
