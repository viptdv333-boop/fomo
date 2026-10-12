import { randomUUID } from "crypto";
import { createWriteStream } from "fs";
import { mkdir, rename, statfs, unlink } from "fs/promises";
import path from "path";
import { Readable, Transform, type TransformCallback } from "stream";
import { pipeline } from "stream/promises";

/**
 * Large video uploads (training videos of a channel owner, up to 500 MB).
 *
 * /api/upload parses a multipart body with request.formData(), which holds the whole file in memory: fine for 10 MB (100 MB for
 * messages), not for 500 MB on a 4 GB VPS shared with the database. This path takes the file as the raw request body and pipes it
 * to disk chunk by chunk (Readable.fromWeb -> VideoGuard -> write stream), so the memory used does not depend on the file size.
 * No Next.js or database import here on purpose: the pure parts are checked by scripts/check-large-upload.ts.
 */

export const SMALL_UPLOAD_BYTES = 10 * 1024 * 1024;
export const LARGE_UPLOAD_BYTES = 500 * 1024 * 1024;
/** Large uploads running at once in this process (disk + socket pressure). */
export const MAX_CONCURRENT_LARGE = 2;
/** A started upload that sends nothing for this long is cut (a dead phone must not hold a slot until the request timeout). */
export const IDLE_TIMEOUT_MS = 120_000;
/** Per user: this many upload attempts per window. */
export const RATE_LIMIT = { limit: 20, windowMs: 60 * 60 * 1000 };
/** Free disk space that must remain after the file is written. */
export const MIN_FREE_AFTER_BYTES = 1024 * 1024 * 1024;

export type VideoKind = "mp4" | "webm";
export const VIDEO_MIME: Record<string, VideoKind> = { "video/mp4": "mp4", "video/webm": "webm" };

export type UploadFailure = "too_large" | "bad_type" | "empty" | "idle" | "aborted";

export class UploadError extends Error {
  constructor(public code: UploadFailure, message?: string) {
    super(message || code);
    this.name = "UploadError";
  }
}

/** What the first bytes say the file is: MP4 («....ftyp») or WebM/Matroska (EBML header 1A 45 DF A3). */
export function sniffVideo(head: Uint8Array): VideoKind | null {
  if (head.length >= 8 && head[4] === 0x66 && head[5] === 0x74 && head[6] === 0x79 && head[7] === 0x70) return "mp4";
  if (head.length >= 4 && head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) return "webm";
  return null;
}

const SNIFF_BYTES = 12;

/**
 * Pass-through transform: counts the bytes (fails with too_large the moment the limit is crossed), checks the first bytes against
 * the declared type before anything reaches the disk, and fails with idle when the sender goes quiet.
 */
export class VideoGuard extends Transform {
  bytes = 0;
  private head: Buffer[] = [];
  private headLen = 0;
  private checked = false;
  private timer: NodeJS.Timeout | null = null;

  constructor(private opts: { maxBytes: number; expected: VideoKind; idleMs?: number }) {
    super();
    this.arm();
  }

  private arm() {
    const ms = this.opts.idleMs ?? IDLE_TIMEOUT_MS;
    if (this.timer) clearTimeout(this.timer);
    if (ms > 0) {
      this.timer = setTimeout(() => this.destroy(new UploadError("idle")), ms);
    }
  }

  private disarm() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private verifyHead(): UploadError | null {
    const kind = sniffVideo(Buffer.concat(this.head, this.headLen));
    return kind === this.opts.expected ? null : new UploadError("bad_type");
  }

  _transform(chunk: Buffer, _enc: BufferEncoding, cb: TransformCallback) {
    this.arm();
    this.bytes += chunk.length;
    if (this.bytes > this.opts.maxBytes) return cb(new UploadError("too_large"));
    if (this.checked) return cb(null, chunk);
    this.head.push(chunk);
    this.headLen += chunk.length;
    if (this.headLen < SNIFF_BYTES) return cb();
    const bad = this.verifyHead();
    if (bad) return cb(bad);
    this.checked = true;
    const all = Buffer.concat(this.head, this.headLen);
    this.head = [];
    cb(null, all);
  }

  _flush(cb: TransformCallback) {
    this.disarm();
    if (this.bytes === 0) return cb(new UploadError("empty"));
    if (!this.checked) {
      // a file shorter than the sniff window: still has to look like a video
      const bad = this.verifyHead();
      if (bad) return cb(bad);
      return cb(null, Buffer.concat(this.head, this.headLen));
    }
    cb();
  }

  _destroy(err: Error | null, cb: (e: Error | null) => void) {
    this.disarm();
    cb(err);
  }
}

// ---------------------------------------------------------------------------------------------------------------------------
// concurrency
// ---------------------------------------------------------------------------------------------------------------------------

type Slots = { total: number; users: Set<string> };
const SLOTS_KEY = Symbol.for("fomo.largeUploadSlots");

function slots(): Slots {
  const g = globalThis as any;
  return (g[SLOTS_KEY] ||= { total: 0, users: new Set<string>() });
}

/** A slot for one large upload, or the reason there is none. Release it in `finally`. */
export function acquireSlot(userId: string, max = MAX_CONCURRENT_LARGE): { release: () => void } | "user_busy" | "server_busy" {
  const s = slots();
  if (s.users.has(userId)) return "user_busy";
  if (s.total >= max) return "server_busy";
  s.total++;
  s.users.add(userId);
  let done = false;
  return {
    release() {
      if (done) return;
      done = true;
      s.total--;
      s.users.delete(userId);
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------------------
// the write
// ---------------------------------------------------------------------------------------------------------------------------

/**
 * Streams `body` into public/uploads/ideas/<userId>/<uuid>.<kind> (the path saveUploadedFile uses, so URLs and serving stay the
 * same). The bytes go to <uuid>.<kind>.part first and are renamed when complete: a half-written file is never reachable by URL,
 * and a failed one is deleted.
 */
export async function streamVideoToDisk(
  body: ReadableStream<Uint8Array>,
  opts: { userId: string; kind: VideoKind; maxBytes: number; root?: string; idleMs?: number }
): Promise<{ url: string; bytes: number }> {
  const root = opts.root ?? process.cwd();
  const dir = path.join(root, "public", "uploads", "ideas", opts.userId);
  await mkdir(dir, { recursive: true });
  const filename = `${randomUUID()}.${opts.kind}`;
  const finalPath = path.join(dir, filename);
  const tmpPath = finalPath + ".part";
  const guard = new VideoGuard({ maxBytes: opts.maxBytes, expected: opts.kind, idleMs: opts.idleMs });
  try {
    await pipeline(Readable.fromWeb(body as any), guard, createWriteStream(tmpPath));
    await rename(tmpPath, finalPath);
  } catch (err) {
    await unlink(tmpPath).catch(() => {});
    throw err;
  }
  return { url: `/uploads/ideas/${opts.userId}/${filename}`, bytes: guard.bytes };
}

/** Free bytes on the disk that holds `dir` (null where the platform cannot tell). */
export async function freeBytes(dir: string): Promise<number | null> {
  try {
    await mkdir(dir, { recursive: true });
    const s = await statfs(dir);
    return Number(s.bavail) * Number(s.bsize);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------------------------------------------------------
// the request handler (Next-free: the route passes in who the user is)
// ---------------------------------------------------------------------------------------------------------------------------

export interface UploadUser {
  id: string;
  role?: string;
  status?: string;
}

export interface StreamDeps {
  getUser: () => Promise<UploadUser | null>;
  /** does the user own a channel (a subscription tariff)? Only asked for plain USER accounts. */
  ownsChannel: (userId: string) => Promise<boolean>;
  rateLimit: (key: string, limit: number, windowMs: number) => Promise<{ allowed: boolean; retryAfterSec: number }>;
  root?: string;
  idleMs?: number;
  log?: (msg: string) => void;
}

function json(body: unknown, status: number, extra?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extra },
  });
}

/** Staff (ADMIN / OWNER) and channel owners may send up to 500 MB, everybody else stays at the 10 MB of /api/upload. */
export async function maxBytesFor(user: UploadUser, deps: Pick<StreamDeps, "ownsChannel">): Promise<number> {
  if (user.role === "ADMIN" || user.role === "OWNER") return LARGE_UPLOAD_BYTES;
  return (await deps.ownsChannel(user.id)) ? LARGE_UPLOAD_BYTES : SMALL_UPLOAD_BYTES;
}

export function cleanFileName(raw: string | null): string {
  let name = "";
  try {
    name = raw ? decodeURIComponent(raw) : "";
  } catch {
    name = raw || "";
  }
  name = name.replace(/[\u0000-\u001f\u007f]/g, "").replace(/[\\/]/g, "_").trim().slice(0, 200);
  return name || "video";
}

export async function handleLimits(deps: StreamDeps): Promise<Response> {
  const user = await deps.getUser();
  if (!user || user.status !== "APPROVED") return json({ error: "Unauthorized" }, 401);
  const max = await maxBytesFor(user, deps);
  return json({ maxMb: Math.round(max / 1024 / 1024), smallMb: Math.round(SMALL_UPLOAD_BYTES / 1024 / 1024) }, 200);
}

export async function handleStreamUpload(req: Request, deps: StreamDeps): Promise<Response> {
  const log = deps.log ?? (() => {});
  const user = await deps.getUser();
  if (!user || user.status !== "APPROVED") return json({ error: "Unauthorized" }, 401);

  const maxBytes = await maxBytesFor(user, deps);
  const maxMb = Math.round(maxBytes / 1024 / 1024);

  const mime = (req.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  const kind = VIDEO_MIME[mime];
  if (!kind) return json({ error: "bad_type" }, 415);

  const lenHeader = req.headers.get("content-length");
  let declared: number | null = null;
  if (lenHeader !== null) {
    declared = Number(lenHeader);
    if (!Number.isFinite(declared) || declared <= 0) return json({ error: "empty" }, 400);
    if (declared > maxBytes) return json({ error: "too_large", maxMb }, 413);
  }
  if (!req.body) return json({ error: "empty" }, 400);

  const rl = await deps.rateLimit(`upload-stream:${user.id}`, RATE_LIMIT.limit, RATE_LIMIT.windowMs);
  if (!rl.allowed) return json({ error: "rate_limited" }, 429, { "Retry-After": String(rl.retryAfterSec) });

  if (declared !== null) {
    const free = await freeBytes(path.join(deps.root ?? process.cwd(), "public", "uploads", "ideas"));
    if (free !== null && free < declared + MIN_FREE_AFTER_BYTES) {
      log(`[upload/stream] not enough disk: free=${free} need=${declared}`);
      return json({ error: "no_space" }, 507);
    }
  }

  const slot = acquireSlot(user.id);
  if (slot === "user_busy") return json({ error: "user_busy" }, 429, { "Retry-After": "30" });
  if (slot === "server_busy") return json({ error: "server_busy" }, 503, { "Retry-After": "30" });

  const name = cleanFileName(req.headers.get("x-file-name"));
  try {
    const { url, bytes } = await streamVideoToDisk(req.body, { userId: user.id, kind, maxBytes, root: deps.root, idleMs: deps.idleMs });
    log(`[upload/stream] OK ${url} ${bytes} bytes`);
    return json({ url, name, fileType: "video" }, 200);
  } catch (err: any) {
    if (err instanceof UploadError) {
      log(`[upload/stream] rejected: ${err.code}`);
      if (err.code === "too_large") return json({ error: "too_large", maxMb }, 413);
      if (err.code === "bad_type") return json({ error: "bad_type" }, 415);
      if (err.code === "empty") return json({ error: "empty" }, 400);
      if (err.code === "idle") return json({ error: "idle" }, 408);
    }
    // the client went away mid-body (cancel, lost network): nobody reads the answer
    log(`[upload/stream] aborted/failed: ${err?.message || err}`);
    return json({ error: "aborted" }, 499);
  } finally {
    slot.release();
  }
}
