import { readFile } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";

// Crawlers and services like Yandex.Metrika fetch /favicon.ico from the root
// by convention and ignore <link rel="icon">. The uploaded favicon lives under
// /uploads, so without this route the root path 404s and those services fall
// back to a generic globe.
export const runtime = "nodejs";
export const revalidate = 3600;

const FALLBACK = "/logo-fomo.png";

export async function GET(): Promise<Response> {
  let iconPath = FALLBACK;
  try {
    const settings = await prisma.siteSettings.findUnique({ where: { id: "singleton" } });
    if (settings?.faviconUrl?.startsWith("/")) iconPath = settings.faviconUrl;
  } catch {
    // DB unreachable — fall through to the bundled logo.
  }

  // Strip any query string and refuse traversal outside /public.
  const clean = iconPath.split("?")[0];
  if (clean.includes("..")) return new Response("Not found", { status: 404 });

  const file = path.join(process.cwd(), "public", clean);
  try {
    const buf = await readFile(file);
    const ext = path.extname(clean).toLowerCase();
    const type =
      ext === ".ico" ? "image/x-icon" : ext === ".svg" ? "image/svg+xml" : "image/png";
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": type,
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
