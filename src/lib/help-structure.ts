// Shape of the public knowledge base page /help: how many numbered items each block has.
// The page (src/app/(main)/help/page.tsx) renders from these counts, and scripts/check-help-i18n.ts
// derives every dictionary key the page needs from them, so a block can never lose a translation silently.

export const HELP_COUNTS = {
  startLi: 3,
  startMap: 7,
  regSteps: 3,
  instSteps: 3,
  cabCards: 6,
  boardItems: 6,
  ideaSteps: 5,
  paidRows: 4,
  channelSteps: 4,
  payCards: 4,
  plinkAuthor: 5,
  plinkBuyer: 4,
  chatCards: 4,
  chatAttach: 3,
  ntfChannels: 6,
  ntfTelegram: 4,
  calViews: 3,
  calFilters: 3,
  calLayers: 5,
  calReminder: 3,
  /** Number of bullet items in each of the terminal groups g1..gN. */
  termGroups: [8, 5, 3, 3, 3, 3, 4, 5, 2],
  rulesGood: 3,
  rulesBad: 6,
  faq: 16,
  newItems: 7,
} as const;

export const HELP_SECTIONS = [
  { id: "start", key: "help.nav.start" },
  { id: "registration", key: "help.nav.registration" },
  { id: "install", key: "help.nav.install" },
  { id: "cabinet", key: "help.nav.cabinet" },
  { id: "board", key: "help.nav.board" },
  { id: "ideas", key: "help.nav.ideas" },
  { id: "rating", key: "help.nav.rating" },
  { id: "paid-ideas", key: "help.nav.paidIdeas" },
  { id: "channels", key: "help.nav.channels" },
  { id: "payments", key: "help.nav.payments" },
  { id: "payment-link", key: "help.nav.paylink" },
  { id: "commission", key: "help.nav.commission" },
  { id: "chat", key: "help.nav.chat" },
  { id: "terminal", key: "help.nav.terminal" },
  { id: "calendar", key: "help.nav.calendar" },
  { id: "notifications", key: "help.nav.notifications" },
  { id: "rules", key: "help.nav.rules" },
  { id: "faq", key: "help.nav.faq" },
  { id: "whats-new", key: "help.nav.whatsnew" },
] as const;

export function range(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i + 1);
}

/** Every dictionary key that is built from a counter (the literal t("...") keys are found by scanning the sources). */
export function countedHelpKeys(): string[] {
  const c = HELP_COUNTS;
  const out: string[] = [];
  const add = (n: number, ...f: ((i: number) => string)[]) => range(n).forEach((i) => f.forEach((g) => out.push(g(i))));
  add(c.startLi, (i) => `help.start.li${i}b`, (i) => `help.start.li${i}`);
  add(c.startMap, (i) => `help.start.m${i}t`, (i) => `help.start.m${i}d`);
  add(c.regSteps, (i) => `help.reg.s${i}t`, (i) => `help.reg.s${i}d`);
  add(c.instSteps, (i) => `help.inst.s${i}t`, (i) => `help.inst.s${i}d`);
  add(c.cabCards, (i) => `help.cab.c${i}t`, (i) => `help.cab.c${i}d`);
  add(c.boardItems, (i) => `help.board.b${i}t`, (i) => `help.board.b${i}`);
  add(c.ideaSteps, (i) => `help.ideas.s${i}t`, (i) => `help.ideas.s${i}d`);
  add(c.paidRows, (i) => `help.paid.r${i}`, (i) => `help.paid.v${i}`);
  add(c.channelSteps, (i) => `help.ch.s${i}t`, (i) => `help.ch.s${i}d`);
  add(c.payCards, (i) => `help.pay.card${i}t`, (i) => `help.pay.card${i}d`);
  add(c.plinkAuthor, (i) => `help.plink.a${i}t`, (i) => `help.plink.a${i}d`);
  add(c.plinkBuyer, (i) => `help.plink.b${i}t`, (i) => `help.plink.b${i}d`);
  add(c.chatCards, (i) => `help.chat.c${i}t`, (i) => `help.chat.c${i}d`);
  add(c.chatAttach, (i) => `help.chat.at${i}t`, (i) => `help.chat.at${i}d`);
  add(c.ntfChannels, (i) => `help.ntf.ch${i}t`, (i) => `help.ntf.ch${i}d`);
  add(c.ntfTelegram, (i) => `help.ntf.tg${i}t`, (i) => `help.ntf.tg${i}d`);
  add(c.calViews, (i) => `help.cal.v${i}t`, (i) => `help.cal.v${i}d`);
  add(c.calFilters, (i) => `help.cal.f${i}t`, (i) => `help.cal.f${i}d`);
  add(c.calLayers, (i) => `help.cal.l${i}t`, (i) => `help.cal.l${i}d`);
  add(c.calReminder, (i) => `help.cal.rem${i}t`, (i) => `help.cal.rem${i}d`);
  c.termGroups.forEach((items, g) => {
    out.push(`help.term.g${g + 1}t`);
    add(items, (i) => `help.term.g${g + 1}.i${i}b`, (i) => `help.term.g${g + 1}.i${i}`);
  });
  add(c.rulesGood, (i) => `help.rules.good${i}`);
  add(c.rulesBad, (i) => `help.rules.bad${i}`);
  add(c.faq, (i) => `help.faq.q${i}`, (i) => `help.faq.a${i}`);
  add(c.newItems, (i) => `help.new.i${i}t`, (i) => `help.new.i${i}d`);
  for (const s of HELP_SECTIONS) out.push(s.key);
  return out;
}
