// Market data types (shared between client and server)

export interface KlineData {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type DataSource = "moex" | "none";
