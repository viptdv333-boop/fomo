/** Pure ISS table helper (no Node imports: also reached by the client bundle through algopack-parse.ts). */

/** ISS block {columns, data} -> row objects with lower-case keys. Block by name, else "data", else the first block that has columns. */
export function tableRows(payload: any, block?: string): Record<string, any>[] {
  if (!payload || typeof payload !== "object") return [];
  let b: any = block ? payload[block] : undefined;
  if (!b || !Array.isArray(b.columns)) b = payload.data && Array.isArray(payload.data.columns) ? payload.data : undefined;
  if (!b) {
    for (const v of Object.values(payload)) {
      if (v && typeof v === "object" && Array.isArray((v as any).columns) && Array.isArray((v as any).data)) {
        b = v;
        break;
      }
    }
  }
  if (!b || !Array.isArray(b.columns) || !Array.isArray(b.data)) return [];
  const cols: string[] = b.columns.map((c: unknown) => String(c).toLowerCase());
  const out: Record<string, any>[] = [];
  for (const r of b.data) {
    if (!Array.isArray(r)) continue;
    const o: Record<string, any> = {};
    for (let i = 0; i < cols.length; i++) o[cols[i]] = r[i];
    out.push(o);
  }
  return out;
}
