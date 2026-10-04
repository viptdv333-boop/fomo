import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getT } from "@/lib/i18n/server";
import { channelAllowed, getEvent, isChannelId, isEventId, isValidTimezone } from "@/lib/notification-events";
import { limited, loadSettings, requireUserId, unauthorized } from "@/lib/notify-api";

// GET — channels (status, masked address), explicit preference overrides, quiet hours.
export async function GET() {
  const userId = await requireUserId();
  if (!userId) return unauthorized();
  return NextResponse.json(await loadSettings(userId));
}

const cell = z.object({
  event: z.string().refine(isEventId),
  channel: z.string().refine(isChannelId),
  enabled: z.boolean(),
});

const patchSchema = z
  .object({
    prefs: z.array(cell).max(200).optional(),
    quiet: z
      .object({
        enabled: z.boolean(),
        startMin: z.number().int().min(0).max(1439),
        endMin: z.number().int().min(0).max(1439),
        timezone: z.string().max(64).refine(isValidTimezone),
      })
      .optional(),
    /** drop every override → built-in defaults (quiet hours are left alone) */
    reset: z.boolean().optional(),
  })
  .strict();

// PATCH — save switches / quiet hours / reset. Idempotent; the UI sends it debounced.
export async function PATCH(req: NextRequest) {
  const userId = await requireUserId();
  if (!userId) return unauthorized();
  const { t } = await getT();

  const blocked = await limited(`nsettings:${userId}`, 120, 60_000);
  if (blocked) return blocked;

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: t("ns.err.invalid") }, { status: 400 });
  const { prefs, quiet, reset } = parsed.data;

  for (const p of prefs ?? []) {
    const def = getEvent(p.event)!;
    // System/security messages can't be switched off, and a cell the event never uses can't be set.
    if (def.alwaysOn || !channelAllowed(def.id, p.channel as never)) {
      return NextResponse.json({ error: t("ns.err.alwaysOn") }, { status: 400 });
    }
  }

  const ops = [];
  if (reset) ops.push(prisma.notificationPref.deleteMany({ where: { userId } }));
  for (const p of prefs ?? []) {
    ops.push(
      prisma.notificationPref.upsert({
        where: { userId_event_channel: { userId, event: p.event, channel: p.channel } },
        create: { userId, event: p.event, channel: p.channel, enabled: p.enabled },
        update: { enabled: p.enabled },
      })
    );
  }
  if (quiet) {
    ops.push(
      prisma.notificationSetting.upsert({
        where: { userId },
        create: { userId, quietEnabled: quiet.enabled, quietStartMin: quiet.startMin, quietEndMin: quiet.endMin, timezone: quiet.timezone },
        update: { quietEnabled: quiet.enabled, quietStartMin: quiet.startMin, quietEndMin: quiet.endMin, timezone: quiet.timezone },
      })
    );
  }
  if (ops.length > 0) await prisma.$transaction(ops);

  return NextResponse.json(await loadSettings(userId));
}
