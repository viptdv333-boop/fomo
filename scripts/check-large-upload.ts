/* Large video upload (src/lib/large-upload.ts): the byte counter, the magic-bytes check, the streaming write, the access rules, the slots.
   No database, no Next: the handler is driven with fake users. Run: npx tsx scripts/check-large-upload.ts   (exit code 1 on a failed assertion) */
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from "fs";
import os from "os";
import path from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import {
  LARGE_UPLOAD_BYTES,
  SMALL_UPLOAD_BYTES,
  UploadError,
  VideoGuard,
  acquireSlot,
  cleanFileName,
  handleLimits,
  handleStreamUpload,
  sniffVideo,
  streamVideoToDisk,
  type StreamDeps,
} from "../src/lib/large-upload";

export {}; // a module: the other check scripts declare the same top-level names, and `next build` type-checks them all together

let fails = 0;
function eq(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
}

const MP4_HEAD = Buffer.from([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 2, 0]);
const WEBM_HEAD = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01, 0x42, 0xf7, 0x81, 0x01]);
const pad = (n: number) => Buffer.alloc(n, 7);
const web = (chunks: Buffer[]) => Readable.toWeb(Readable.from(chunks, { objectMode: false })) as unknown as ReadableStream<Uint8Array>;

async function guardResult(chunks: Buffer[], opts: { maxBytes: number; expected: "mp4" | "webm"; idleMs?: number }) {
  const g = new VideoGuard(opts);
  const out: Buffer[] = [];
  try {
    await pipeline(Readable.from(chunks, { objectMode: false }), g, async function (src: AsyncIterable<Buffer>) {
      for await (const c of src) out.push(c);
    });
    return { ok: true, bytes: g.bytes, out: Buffer.concat(out) };
  } catch (e: any) {
    return { ok: false, code: e instanceof UploadError ? e.code : String(e?.message) };
  }
}

async function main() {
  // --- magic bytes
  eq("sniff: mp4 (ftyp at 4)", sniffVideo(MP4_HEAD), "mp4");
  eq("sniff: webm (EBML)", sniffVideo(WEBM_HEAD), "webm");
  eq(
    "sniff: junk / html / png / too short",
    [sniffVideo(Buffer.from("<html><body>")), sniffVideo(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), sniffVideo(Buffer.alloc(0)), sniffVideo(Buffer.from([0x1a, 0x45]))],
    [null, null, null, null]
  );

  // --- the guard
  const ok1 = await guardResult([MP4_HEAD, pad(1000)], { maxBytes: 5000, expected: "mp4" });
  eq("guard: a good mp4 passes unchanged", [ok1.ok, ok1.bytes, ok1.out && Buffer.compare(ok1.out, Buffer.concat([MP4_HEAD, pad(1000)]))], [true, MP4_HEAD.length + 1000, 0]);
  const split = await guardResult([MP4_HEAD.subarray(0, 3), MP4_HEAD.subarray(3, 9), MP4_HEAD.subarray(9), pad(50)], { maxBytes: 5000, expected: "mp4" });
  eq("guard: the first bytes arrive in tiny pieces", [split.ok, split.out && split.out.length], [true, MP4_HEAD.length + 50]);
  eq("guard: exactly the limit passes", (await guardResult([MP4_HEAD, pad(5000 - MP4_HEAD.length)], { maxBytes: 5000, expected: "mp4" })).ok, true);
  eq("guard: one byte over the limit fails", await guardResult([MP4_HEAD, pad(5001 - MP4_HEAD.length)], { maxBytes: 5000, expected: "mp4" }), { ok: false, code: "too_large" });
  eq("guard: the limit is hit across chunks", await guardResult([MP4_HEAD, ...Array.from({ length: 10 }, () => pad(1000))], { maxBytes: 5000, expected: "mp4" }), { ok: false, code: "too_large" });
  eq("guard: a text file called mp4 is refused", await guardResult([Buffer.from("this is not a video at all, just text")], { maxBytes: 5000, expected: "mp4" }), { ok: false, code: "bad_type" });
  eq("guard: webm declared, mp4 sent -> refused", await guardResult([MP4_HEAD, pad(100)], { maxBytes: 5000, expected: "webm" }), { ok: false, code: "bad_type" });
  eq("guard: a webm passes as webm", (await guardResult([WEBM_HEAD, pad(100)], { maxBytes: 5000, expected: "webm" })).ok, true);
  eq("guard: empty body", await guardResult([], { maxBytes: 5000, expected: "mp4" }), { ok: false, code: "empty" });
  eq("guard: shorter than the sniff window but not a video", await guardResult([Buffer.from("abc")], { maxBytes: 5000, expected: "mp4" }), { ok: false, code: "bad_type" });
  const idle = new VideoGuard({ maxBytes: 5000, expected: "mp4", idleMs: 40 });
  const idleRes = await new Promise((resolve) => {
    idle.on("error", (e: any) => resolve(e?.code));
    idle.write(MP4_HEAD);
  });
  eq("guard: a sender that goes quiet is cut (idle)", idleRes, "idle");

  // --- slots
  const a = acquireSlot("u1", 2);
  const sameUser = acquireSlot("u1", 2);
  const b = acquireSlot("u2", 2);
  const c = acquireSlot("u3", 2);
  eq("slots: one per user, two per process", [typeof a, sameUser, typeof b, c], ["object", "user_busy", "object", "server_busy"]);
  if (typeof a === "object") {
    a.release();
    a.release(); // twice is harmless
  }
  const d = acquireSlot("u3", 2);
  eq("slots: a released slot is free again", typeof d, "object");
  if (typeof d === "object") d.release();
  if (typeof b === "object") b.release();

  // --- the write
  const root = mkdtempSync(path.join(os.tmpdir(), "fomo-large-"));
  try {
    const dir = path.join(root, "public", "uploads", "ideas", "user1");
    const good = await streamVideoToDisk(web([MP4_HEAD, pad(20000)]), { userId: "user1", kind: "mp4", maxBytes: 100000, root });
    eq("write: url like saveUploadedFile's", /^\/uploads\/ideas\/user1\/[0-9a-f-]{36}\.mp4$/.test(good.url), true);
    eq(
      "write: the file is complete and no .part is left",
      [statSync(path.join(root, "public", good.url)).size, readdirSync(dir).filter((f) => f.endsWith(".part")).length],
      [MP4_HEAD.length + 20000, 0]
    );
    const before = readdirSync(dir).length;
    const cases: [string, Buffer[], string][] = [
      ["too large", [MP4_HEAD, pad(200000)], "too_large"],
      ["not a video", [Buffer.from("MZ not a video, a program or a page, anything")], "bad_type"],
    ];
    for (const [label, chunks, want] of cases) {
      let code = "";
      try {
        await streamVideoToDisk(web(chunks), { userId: "user1", kind: "mp4", maxBytes: 100000, root });
      } catch (e: any) {
        code = e?.code;
      }
      eq(`write: ${label} -> refused and nothing left on disk`, [code, readdirSync(dir).length], [want, before]);
    }
    // the sender breaks off in the middle
    let sent = false;
    const broken = new ReadableStream<Uint8Array>({
      pull(ctl) {
        if (!sent) {
          sent = true;
          ctl.enqueue(Buffer.concat([MP4_HEAD, pad(5000)]));
          return;
        }
        return new Promise((_, rej) => setTimeout(() => rej(new Error("socket hang up")), 30));
      },
    });
    let brokeWith = "";
    try {
      await streamVideoToDisk(broken, { userId: "user1", kind: "mp4", maxBytes: 100000, root });
    } catch (e: any) {
      brokeWith = String(e?.message);
    }
    eq("write: a dropped connection -> error and the partial file is deleted", [brokeWith.length > 0, readdirSync(dir).length], [true, before]);

    // --- the handler
    const mk = (user: any, owns: boolean): StreamDeps => ({
      getUser: async () => user,
      ownsChannel: async () => owns,
      rateLimit: async () => ({ allowed: true, retryAfterSec: 60 }),
      root,
    });
    const put = (body: BodyInit | null, headers: Record<string, string>) =>
      new Request("http://x/api/upload/stream", { method: "PUT", body, headers, duplex: "half" } as any);
    const approved = { id: "user1", role: "USER", status: "APPROVED" };
    const status = async (req: Request, deps: StreamDeps) => (await handleStreamUpload(req, deps)).status;
    const vid = (n: number) => Buffer.concat([MP4_HEAD, pad(n)]);
    const big = 11 * 1024 * 1024;

    eq("handler: guest -> 401", await status(put(vid(100), { "content-type": "video/mp4" }), mk(null, false)), 401);
    eq("handler: pending account -> 401", await status(put(vid(100), { "content-type": "video/mp4" }), mk({ id: "p", role: "USER", status: "PENDING" }, true)), 401);
    eq("handler: not a video content-type -> 415", await status(put(vid(100), { "content-type": "image/png" }), mk(approved, true)), 415);
    eq("handler: plain user, small video -> 200", await status(put(vid(100), { "content-type": "video/mp4" }), mk(approved, false)), 200);
    eq("handler: plain user, 11 MB declared -> 413 before reading", await status(put(vid(big), { "content-type": "video/mp4", "content-length": String(big) }), mk(approved, false)), 413);
    eq("handler: plain user, 11 MB body -> 413 (counter or length)", await status(put(vid(big), { "content-type": "video/mp4" }), mk(approved, false)), 413);
    eq("handler: channel owner, 11 MB -> 200", await status(put(vid(big), { "content-type": "video/mp4" }), mk(approved, true)), 200);
    eq("handler: ADMIN needs no channel", await status(put(vid(big), { "content-type": "video/mp4" }), mk({ ...approved, role: "ADMIN" }, false)), 200);
    eq("handler: OWNER needs no channel", await status(put(vid(big), { "content-type": "video/mp4" }), mk({ ...approved, role: "OWNER" }, false)), 200);
    eq("handler: mp4 bytes declared as webm -> 415", await status(put(vid(100), { "content-type": "video/webm" }), mk(approved, true)), 415);
    eq("handler: over 500 MB declared -> 413", await status(put(vid(100), { "content-type": "video/mp4", "content-length": String(LARGE_UPLOAD_BYTES + 1) }), mk(approved, true)), 413);
    eq("handler: zero length -> 400", await status(put(vid(100), { "content-type": "video/mp4", "content-length": "0" }), mk(approved, true)), 400);
    const limited = mk(approved, true);
    limited.rateLimit = async () => ({ allowed: false, retryAfterSec: 42 });
    const rl = await handleStreamUpload(put(vid(100), { "content-type": "video/mp4" }), limited);
    eq("handler: rate limit -> 429 + Retry-After", [rl.status, rl.headers.get("retry-after")], [429, "42"]);
    const held = acquireSlot("user1", 2);
    eq("handler: the same user twice at once -> 429", await status(put(vid(100), { "content-type": "video/mp4" }), mk(approved, true)), 429);
    if (typeof held === "object") held.release();
    const okRes = await (await handleStreamUpload(put(vid(300), { "content-type": "video/mp4", "x-file-name": encodeURIComponent("урок 1.mp4") }), mk(approved, false))).json();
    eq("handler: answer shape like /api/upload", [typeof okRes.url, okRes.name, okRes.fileType], ["string", "урок 1.mp4", "video"]);
    const again = acquireSlot("user1", 2);
    eq("handler: the slot is released after each upload", typeof again, "object");
    if (typeof again === "object") again.release();
    const lim = (u: any, o: boolean) => handleLimits(mk(u, o)).then((r) => r.json());
    eq("limits: plain 10, owner 500, guest 401", [(await lim(approved, false)).maxMb, (await lim(approved, true)).maxMb, (await handleLimits(mk(null, false))).status], [10, 500, 401]);
    eq("limits constants", [SMALL_UPLOAD_BYTES, LARGE_UPLOAD_BYTES], [10 * 1048576, 500 * 1048576]);
    eq(
      "file name: decoded, no slashes / control chars, capped",
      [cleanFileName(encodeURIComponent("a/b\\c\u0001.mp4")), cleanFileName(null), cleanFileName("x".repeat(500)).length],
      ["a_b_c.mp4", "video", 200]
    );
    eq("only public/uploads/ideas/<user> was written", readdirSync(path.join(root, "public", "uploads")), ["ideas"]);
    eq("the uploads dir exists", existsSync(path.join(root, "public", "uploads", "ideas", "user1")), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }

  console.log(fails ? `\n${fails} FAILED` : "\nall ok");
  process.exit(fails ? 1 : 0);
}

main();
