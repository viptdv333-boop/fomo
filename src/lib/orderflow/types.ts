import type { FlowSource } from "./aggregate";
import type { Big } from "./big";

export interface PrepareResult {
  source: FlowSource;
  /** Instrument tick inferred from the trades (0 = unknown yet). */
  nativeTick: number;
  /** Real-time ranges (UTC ms) that have trade data. */
  cov: [number, number][];
  /** More data for the requested range is still being loaded. */
  pending: boolean;
  live: boolean;
  /** The largest trades in [from, to) (UTC ms), oldest first. Absent when the source cannot tell. */
  big?: (from: number, to: number, limit: number) => Big[];
  /** First and last minute (since epoch) worth scanning. */
  bounds: [number, number];
  /** The newest minutes are missing because the source publishes trades late (MOEX ISS ~15 min). */
  delayed?: boolean;
}
