import { NextRequest } from "next/server";
import { timingSafeEqual } from "crypto";

// Публикация от внешних торговых терминалов (Босс, 13.07.2026): сервер-к-серверу,
// без браузерной NextAuth-сессии. Автор зафиксирован здесь — извне им не управлять.
export const BOT_AUTHOR_ID = "cmmteunjn0004csaotp2lnb4a"; // аккаунт «Михаил», /profile/cmmteunjn0004csaotp2lnb4a

export function checkBotToken(request: NextRequest): boolean {
  const expected = process.env.FOMO_BOT_TOKEN;
  if (!expected) return false;
  const got = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
