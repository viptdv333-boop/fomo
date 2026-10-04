/**
 * One tick of the calendar-reminder scheduler, against an abstract store (so scripts/check-calendar-reminders.ts can run it
 * with an in-memory table, two "instances" at once): pick the due rows, CLAIM each atomically, send only what was claimed.
 * Next-free and Prisma-free; server/calendar-reminders.ts wires it to the CalendarReminder table.
 */

import { candidateFrom, candidateTo, selectDue } from "./reminder-logic";

export interface ReminderRow {
  id: string;
  userId: string;
  /** UTC ms */
  eventTs: number;
  title: string;
  country: string;
  impact: number;
  category: string;
  gk: string | null;
  leadMin: number;
}

export interface ReminderStore {
  /** unsent rows whose release is between the two moments (UTC ms) */
  candidates(fromMs: number, toMs: number): Promise<ReminderRow[]>;
  /** atomic "set notifiedAt = at WHERE id AND notifiedAt IS NULL"; true only for the caller that changed the row */
  claim(id: string, at: number): Promise<boolean>;
  /** give a claim back ("notifiedAt = null WHERE id AND notifiedAt = at") after a failed send */
  release(id: string, at: number): Promise<void>;
}

export interface TickResult {
  sent: number;
  /** due, but another instance claimed it first */
  lostClaim: number;
  /** the send threw: the claim was released, the next tick retries */
  failed: number;
}

export async function runDueReminders(store: ReminderStore, send: (row: ReminderRow) => Promise<void>, now: number, onError: (row: ReminderRow, err: unknown) => void = () => {}): Promise<TickResult> {
  const res: TickResult = { sent: 0, lostClaim: 0, failed: 0 };
  const candidates = await store.candidates(candidateFrom(now), candidateTo(now));
  const due = selectDue(
    candidates.map((c) => ({ ...c, notifiedAt: null as number | null })),
    now
  );
  for (const row of due) {
    try {
      if (!(await store.claim(row.id, now))) {
        res.lostClaim++;
        continue;
      }
      try {
        await send(row);
        res.sent++;
      } catch (err) {
        // nothing went out: give the row back so the next tick retries (the lateness window bounds the retries)
        await store.release(row.id, now).catch(() => {});
        res.failed++;
        throw err;
      }
    } catch (err) {
      onError(row, err);
    }
  }
  return res;
}
