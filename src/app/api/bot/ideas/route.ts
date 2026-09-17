import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod/v4";
import { BOT_AUTHOR_ID, checkBotToken } from "@/lib/bot-auth";
import { notifyChannelTelegramSubscribers, escapeTelegramHtml } from "@/lib/telegram";

// Публикация от внешних торговых терминалов (Босс, 13.07.2026): сервер-к-серверу,
// без браузерной NextAuth-сессии, автор зафиксирован (bot-auth.ts) — эндпоинт
// намеренно не даёт управлять isPaid/price/authorId извне.
// Намеренно НЕ трогает рейтинг/подписчиков/фолловер-уведомления — это
// автоматика, а не органическая публикация автора, никаких побочных эффектов
// на аккаунт быть не должно. Исключение (17.09.2026): подписчики канала САМИ
// включают пересылку сетапов в свой Telegram-бот — это их собственная
// настройка, не влияющая на аккаунт бота-автора, поэтому здесь она
// выполняется всегда, когда пост уходит в закрытый канал (tariffId).
//
// КАНАЛЫ (13.09.2026): channelId — публикация в закрытый канал бота-автора.
// Такой пост закрыт (isPaid), без цены, открывается подпиской на канал и в
// общей ленте не показывается. Канал не найден, чужой или выключен — ОТКАЗ:
// тихо опубликовать в общую ленту вместо канала нельзя, платный текст ушёл бы
// в открытый доступ. Ответ эхом возвращает channelId — терминал сверяет его.
// Без channelId — прежнее поведение: бесплатная идея в общей ленте.

// FOMO's own instrument slugs encode exchange + ticker (e.g. "ice-kc" for
// ICE coffee), which a trading bot has no reason to know — it naturally
// sends the plain commodity name or ticker instead, and the exact-match
// lookup below silently tags nothing. Scoped to instruments listed on
// exactly one exchange; anything traded on several (oil, gas, gold, sugar,
// cocoa, wheat...) stays exact-match-only rather than guessing which
// contract the bot meant.
const INSTRUMENT_ALIASES: Record<string, string> = {
  coffee: "ice-kc",
};

const createBotIdeaSchema = z.object({
  title: z.string().min(1).max(300),
  preview: z.string().min(1).max(1000),
  content: z.string().min(1),
  instrumentSlugs: z.array(z.string()).optional(),
  channelId: z.string().min(1).optional(),
});

export async function POST(request: NextRequest) {
  if (!checkBotToken(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = createBotIdeaSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.issues },
      { status: 400 }
    );
  }
  const { title, preview, content, instrumentSlugs, channelId } = parsed.data;

  let tariffId: string | null = null;
  if (channelId) {
    const tariff = await prisma.subscriptionTariff.findUnique({
      where: { id: channelId },
      select: { id: true, authorId: true, isActive: true },
    });
    if (!tariff || tariff.authorId !== BOT_AUTHOR_ID) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }
    if (!tariff.isActive) {
      return NextResponse.json({ error: "Channel is not active" }, { status: 400 });
    }
    tariffId = tariff.id;
  }

  const resolvedSlugs = instrumentSlugs?.map(
    (s) => INSTRUMENT_ALIASES[s.toLowerCase()] || s
  );

  const instruments = resolvedSlugs?.length
    ? await prisma.instrument.findMany({
        where: {
          OR: [
            { slug: { in: resolvedSlugs, mode: "insensitive" } },
            { ticker: { in: resolvedSlugs, mode: "insensitive" } },
          ],
        },
        select: { id: true },
      })
    : [];

  const idea = await prisma.idea.create({
    data: {
      title,
      preview,
      content,
      isPaid: tariffId !== null,
      acceptDonations: false,
      authorId: BOT_AUTHOR_ID,
      tariffId,
      instruments: {
        create: instruments.map((i) => ({ instrumentId: i.id })),
      },
    },
    select: { id: true, title: true, createdAt: true, tariffId: true },
  });

  if (tariffId) {
    await notifyChannelTelegramSubscribers(
      tariffId,
      `🔔 Новый сетап: <b>${escapeTelegramHtml(title)}</b>\n${escapeTelegramHtml(preview)}\n\nhttps://fomo.spot/ideas/${idea.id}`
    ).catch(() => {});
  }

  const { tariffId: savedChannelId, ...rest } = idea;
  return NextResponse.json(
    {
      ...rest,
      channelId: savedChannelId,
      matchedInstruments: instruments.length,
      url: `/ideas/${idea.id}`,
    },
    { status: 201 }
  );
}
