import { z } from "zod/v4";
import { ALERT_LINE_TOOLS } from "@/lib/alerts/evaluate";

export const MAX_ACTIVE_ALERTS = 100;

const num = z.number().finite();
const pointSchema = z.object({ t: num, p: num });

export const lineSchema = z.object({
  tool: z.enum(ALERT_LINE_TOOLS),
  p1: pointSchema,
  p2: pointSchema,
});

export const conditionSchema = z.enum(["cross", "up", "down"]);
const expiresSchema = z.union([z.iso.datetime({ offset: true }), z.null()]);

export const createSchema = z
  .object({
    // only sources with a server-side quote feed (see src/lib/quotes.ts)
    source: z.enum(["moex", "bybit"]),
    ticker: z.string().min(1).max(40),
    dataTicker: z.string().min(1).max(40),
    name: z.string().max(120).default(""),
    kind: z.enum(["price", "line"]).default("price"),
    condition: conditionSchema.default("cross"),
    price: num.positive().optional(),
    line: lineSchema.optional(),
    message: z.string().trim().max(200).optional(),
    repeat: z.boolean().default(false),
    expiresAt: expiresSchema.optional(),
  })
  .refine((v) => (v.kind === "price" ? v.price !== undefined : v.line !== undefined), { message: "level required" });

export const patchSchema = z.object({
  status: z.enum(["active", "paused"]).optional(),
  condition: conditionSchema.optional(),
  price: num.positive().optional(),
  message: z.string().trim().max(200).nullable().optional(),
  repeat: z.boolean().optional(),
  expiresAt: expiresSchema.optional(),
});
