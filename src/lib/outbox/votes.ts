// Pure helper for likes sent through the outbox: the vote the user sees = the server's vote with the still-unsent request laid over it.
export interface VoteState {
  userVote: number | null;
  voteScore: number;
}
/** The unsent request: `state` true = «this vote must exist» (value 1 / -1), false = «it must not exist». */
export interface PendingVote {
  value: 1 | -1;
  state: boolean;
}

export function applyPendingVote(base: VoteState, pend: PendingVote | null | undefined): VoteState {
  if (!pend) return base;
  const u = base.userVote ?? 0;
  if (pend.state) return { userVote: pend.value, voteScore: base.voteScore - u + pend.value };
  if (u === pend.value) return { userVote: null, voteScore: base.voteScore - u };
  return base;
}

/** The preview an item of kind idea_vote carries */
export function pendingVoteOf(preview: unknown): PendingVote | null {
  const p = preview as { value?: unknown; state?: unknown } | null;
  if (!p || typeof p.state !== "boolean" || (p.value !== 1 && p.value !== -1)) return null;
  return { value: p.value, state: p.state };
}
