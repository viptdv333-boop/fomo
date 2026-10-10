import { dictScriptFor } from "@/lib/i18n/dict-script";

// GET /i18n/ru-<hash>.js: the dictionary of a language as a script (see src/lib/i18n/dict-script.ts). The address carries the content hash: cached for a year.

export async function GET(_req: Request, ctx: { params: Promise<{ file: string }> }) {
  const { file } = await ctx.params;
  const s = dictScriptFor(file);
  if (!s) return new Response("Not found", { status: 404 });
  return new Response(s.body, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=31536000, immutable",
      ETag: `"${s.hash}"`,
    },
  });
}
