/**
 * Тарифные планы канала (22.10.2026).
 *
 * Канал = строка SubscriptionTariff с parentId = null («корень»). План = строка с parentId = id канала: свой
 * name (название плана), price, durationDays, isActive, способы оплаты, YuKassa; БЕЗ своего чата / slug / описания /
 * аватара (наследует от канала). Корень сам тоже работает как первый план (его цена/срок/способы лежат на нём, поэтому
 * все старые каналы продолжают работать без миграции данных); его название плана — planName (null = старая строка
 * «Канал: План», см. splitTariffName).
 *
 * Всё, что про СОДЕРЖИМОЕ (посты Idea.tariffId, чат channelRoomId, доступ, рассылки, напоминания, список подписчиков),
 * решается на корне. Subscription.tariffId может указывать на любой план семьи (корень + планы): «семья» =
 * tariffFamily(rootId). Доступ/поиск подписчиков везде идёт через `tariffId IN семья`, никогда `tariffId = id канала`.
 * У подписчика на канал ОДНА строка Subscription: оплата другого плана продлевает её (lib/subscriptions.ts).
 *
 * Файл без next/* и без значения-импорта prisma: используется и в браузере, и в server/*.ts, и в scripts/check-tariff-plans.ts.
 */

import type { PrismaClient } from "@prisma/client";

/** Технический предел планов на канал (сам корень не считается). Не продуктовое ограничение: «сколько угодно». */
export const MAX_PLANS_PER_CHANNEL = 50;

/** Минимум, который нужно знать о строке, чтобы понять, канал это или план. */
export interface TariffRef { id: string; parentId?: string | null }

/** Только то, что нужно хелперам: PrismaClient целиком или его транзакционный клиент. */
export type PlanDb = Pick<PrismaClient, "subscriptionTariff">;

// ---------------------------------------------------------------------------------------------------------------------
// Чистая часть
// ---------------------------------------------------------------------------------------------------------------------

/** id канала (корня) для строки: у плана это parentId, у канала — он сам. */
export function rootIdOf(t: TariffRef): string {
  return t.parentId ? t.parentId : t.id;
}

export function isPlanRow(t: TariffRef): boolean {
  return !!t.parentId;
}

/** Семья по списку всех строк автора: корень + все его планы (в порядке корень, затем остальные). */
export function familyFromRows(rootId: string, rows: TariffRef[]): string[] {
  return [rootId, ...rows.filter((r) => r.parentId === rootId && r.id !== rootId).map((r) => r.id)];
}

/** Любая из подписок семьи (или старая «на автора» без tariffId — она открывает всё платное автора). */
export function subscriptionAccessWhere(family: string[], includeLegacyAuthorWide = true) {
  return includeLegacyAuthorWide
    ? { OR: [{ tariffId: { in: family } }, { tariffId: null }] }
    : { tariffId: { in: family } };
}

/** Название плана корня из старого имени «Канал: План» (без двоеточия — null). */
export function splitTariffName(name: string, planName?: string | null): { channel: string; plan: string | null } {
  if (planName != null && planName.trim() !== "") return { channel: name.trim(), plan: planName.trim() };
  const i = name.indexOf(":");
  if (i > 0 && name.slice(i + 1).trim() !== "") return { channel: name.slice(0, i).trim(), plan: name.slice(i + 1).trim() };
  return { channel: name.trim(), plan: null };
}

/**
 * Название плана для подписи в списках. Корень: planName, иначе суффикс старого имени; план: его name.
 * null — подписи нет (в UI остаётся период и цена).
 */
export function planLabelOf(t: { name: string; parentId?: string | null; planName?: string | null }): string | null {
  if (t.parentId) return t.name.trim() || null;
  return splitTariffName(t.name, t.planName).plan;
}

/** Имя КАНАЛА для подписчиков: передайте строку корня (у плана родителя). Новые корни хранят чистое имя; старое «Канал: План» остаётся как есть. */
export function channelNameOf(root: { name: string }): string {
  return root.name.trim();
}

export interface PlanRow {
  id: string;
  name: string;
  planName?: string | null;
  parentId?: string | null;
  price: number | string | { toString(): string };
  durationDays: number;
  isActive: boolean;
  paymentMethods?: string[];
  cardNumber?: string | null;
  sbpQrUrl?: string | null;
}

export interface PlanView {
  id: string;
  /** Название плана («Неделя»), null — нет. */
  label: string | null;
  price: number;
  durationDays: number;
  isRoot: boolean;
  isActive: boolean;
  /** Только если строка принесла эти поля (публичный список тарифов автора): окну оплаты нужны способы оплаты плана. */
  paymentMethods?: string[];
  cardNumber?: string | null;
  sbpQrUrl?: string | null;
}

/** Планы по возрастанию срока, затем цены, затем id (стабильно). */
export function sortPlans<T extends { durationDays: number; price: number; id: string }>(plans: T[]): T[] {
  return [...plans].sort((a, b) => a.durationDays - b.durationDays || a.price - b.price || a.id.localeCompare(b.id));
}

/** Корень (как первый план) + его планы -> варианты подписки, отсортированные «срок, цена». */
export function planViews(root: PlanRow, plans: PlanRow[], onlyActive = true): PlanView[] {
  const toView = (r: PlanRow, isRoot: boolean): PlanView => ({
    id: r.id,
    label: planLabelOf(r),
    price: Number(r.price),
    durationDays: r.durationDays,
    isRoot,
    isActive: r.isActive,
    ...(r.paymentMethods ? { paymentMethods: r.paymentMethods, cardNumber: r.cardNumber ?? null, sbpQrUrl: r.sbpQrUrl ?? null } : {}),
  });
  const all = [toView(root, true), ...plans.filter((p) => p.parentId === root.id).map((p) => toView(p, false))];
  return sortPlans(onlyActive ? all.filter((p) => p.isActive) : all);
}

/** План по умолчанию в окне оплаты: самый дешёвый (при равенстве — корень, затем короче срок). */
export function defaultPlan<T extends { price: number; isRoot: boolean; durationDays: number }>(plans: T[]): T | null {
  if (plans.length === 0) return null;
  return [...plans].sort((a, b) => a.price - b.price || Number(b.isRoot) - Number(a.isRoot) || a.durationDays - b.durationDays)[0];
}

/** Строка карточки канала: первые `max` планов («Неделя 1000 ₽ · Месяц 3000 ₽») + сколько ещё. */
export function planSummary(plans: PlanView[], max = 3): { shown: PlanView[]; more: number } {
  return { shown: plans.slice(0, max), more: Math.max(0, plans.length - max) };
}

export type PlanParentError = "parentNotFound" | "parentNotOwned" | "parentNotRoot" | "parentArchived" | "planLimit";

/** Можно ли создать план под этим родителем (чистая проверка: родитель из БД + число его планов). */
export function validatePlanParent(
  parent: { id: string; authorId: string; parentId: string | null; archivedAt?: Date | null } | null | undefined,
  authorId: string,
  planCount: number
): { ok: true } | { ok: false; code: PlanParentError } {
  if (!parent) return { ok: false, code: "parentNotFound" };
  if (parent.authorId !== authorId) return { ok: false, code: "parentNotOwned" };
  if (parent.parentId) return { ok: false, code: "parentNotRoot" };
  if (parent.archivedAt) return { ok: false, code: "parentArchived" };
  if (planCount >= MAX_PLANS_PER_CHANNEL) return { ok: false, code: "planLimit" };
  return { ok: true };
}

/** Подписчики семьи -> одна запись на человека (дубликаты старых данных: берётся строка с самым поздним концом). */
export function dedupeSubscribers<T extends { subscriberId: string; endDate: Date | string | number }>(rows: T[]): T[] {
  const best = new Map<string, T>();
  for (const r of rows) {
    const prev = best.get(r.subscriberId);
    if (!prev || new Date(r.endDate).getTime() > new Date(prev.endDate).getTime()) best.set(r.subscriberId, r);
  }
  return [...best.values()];
}

// ---------------------------------------------------------------------------------------------------------------------
// БД
// ---------------------------------------------------------------------------------------------------------------------

/** id канала для любого tariffId (план -> parentId, канал -> он сам); null, если строки нет. */
export async function channelRootId(db: PlanDb, tariffId: string | null | undefined): Promise<string | null> {
  if (!tariffId) return null;
  const t = await db.subscriptionTariff.findUnique({ where: { id: tariffId }, select: { id: true, parentId: true } });
  return t ? rootIdOf(t) : null;
}

/** [rootId, ...planIds] — все строки семьи, включая неактивные (подписчик выключенного плана сохраняет доступ). */
export async function tariffFamily(db: PlanDb, rootId: string): Promise<string[]> {
  const plans = await db.subscriptionTariff.findMany({ where: { parentId: rootId }, select: { id: true }, orderBy: { createdAt: "asc" } });
  return [rootId, ...plans.map((p) => p.id)];
}

/** Семья по любому id (канала или плана). Строки нет — семья из одного этого id (поведение «как раньше»). */
export async function familyOfTariff(db: PlanDb, tariffId: string): Promise<string[]> {
  const root = await channelRootId(db, tariffId);
  return root ? tariffFamily(db, root) : [tariffId];
}

/**
 * Семьи для нескольких tariffId разом (два запроса): id -> множество [корень + планы]. Нужна спискам постов, где у каждого
 * поста свой канал. Неизвестный id получает семью из себя самого.
 */
export async function familiesFor(db: PlanDb, tariffIds: (string | null | undefined)[]): Promise<Map<string, Set<string>>> {
  const ids = [...new Set(tariffIds.filter((x): x is string => !!x))];
  const out = new Map<string, Set<string>>();
  if (ids.length === 0) return out;
  const rows = await db.subscriptionTariff.findMany({ where: { id: { in: ids } }, select: { id: true, parentId: true } });
  const rootOf = new Map(rows.map((r) => [r.id, rootIdOf(r)]));
  const roots = [...new Set(rootOf.values())];
  const plans = roots.length
    ? await db.subscriptionTariff.findMany({ where: { parentId: { in: roots } }, select: { id: true, parentId: true } })
    : [];
  for (const id of ids) {
    const root = rootOf.get(id) ?? id;
    out.set(id, new Set([root, ...plans.filter((p) => p.parentId === root).map((p) => p.id)]));
  }
  return out;
}

/** Уникальные подписчики по каналам: subs (активные строки) + карта tariffId -> id канала. Человек на двух планах считается один раз. */
export function subscribersByRoot(
  subs: { tariffId: string | null; subscriberId: string }[],
  rootOfTariff: Map<string, string>
): Map<string, number> {
  const seen = new Map<string, Set<string>>();
  for (const s of subs) {
    if (!s.tariffId) continue;
    const root = rootOfTariff.get(s.tariffId);
    if (!root) continue;
    if (!seen.has(root)) seen.set(root, new Set());
    seen.get(root)!.add(s.subscriberId);
  }
  return new Map([...seen].map(([k, v]) => [k, v.size]));
}

/** Prisma where: строки-каналы (не планы), не закрытые владельцем. Общий фильтр каталогов, списков и карт сайта. */
export const CHANNEL_ROWS = { parentId: null, archivedAt: null } as const;
