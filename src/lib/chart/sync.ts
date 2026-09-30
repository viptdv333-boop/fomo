/* Links several charts of a multi-chart layout: crosshair and visible time range are passed through this hub. */

export interface TimeRange {
  from: number;
  to: number;
}

type CrossListener = (sourceId: string, t: number | null) => void;
type RangeListener = (sourceId: string, range: TimeRange) => void;

export class ChartSyncHub {
  /** Share the crosshair position between charts. */
  crosshair = true;
  /** Share the visible time range (scroll and zoom) between charts. */
  range = false;
  private crossL = new Set<CrossListener>();
  private rangeL = new Set<RangeListener>();

  onCrosshair(cb: CrossListener): () => void {
    this.crossL.add(cb);
    return () => this.crossL.delete(cb);
  }
  onRange(cb: RangeListener): () => void {
    this.rangeL.add(cb);
    return () => this.rangeL.delete(cb);
  }
  emitCrosshair(sourceId: string, t: number | null) {
    if (!this.crosshair) return;
    for (const cb of this.crossL) cb(sourceId, t);
  }
  emitRange(sourceId: string, r: TimeRange) {
    if (!this.range) return;
    for (const cb of this.rangeL) cb(sourceId, r);
  }
}
