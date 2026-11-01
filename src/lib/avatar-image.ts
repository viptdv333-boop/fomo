// Re-encoding of an avatar picture, shared by the account mirror (src/lib/account-mirror-server.ts) and the one-off account sync
// (scripts/sync-accounts.ts): the bytes must really be an image (magic bytes, not a header), the pixel count is bounded, decoding is strict, and
// the result is the same 200x200 JPEG a normal upload produces. The file name is a hash of the re-encoded content, so repeating the copy
// writes the same file (idempotent) and "is this the same picture already?" is a plain string comparison. Node only (sharp).
import { createHash } from "crypto";
import sharp from "sharp";
import { sniffImage } from "./account-mirror";

export interface ReencodedAvatar {
  buffer: Buffer;
  /** first 32 hex characters of the SHA-256 of the re-encoded picture; the file is `<name>.jpg` */
  name: string;
}

export async function reencodeAvatar(input: Buffer): Promise<ReencodedAvatar | null> {
  if (!sniffImage(input)) return null;
  const buffer = await sharp(input, { limitInputPixels: 25_000_000, failOn: "error" })
    .rotate()
    .resize(200, 200, { fit: "cover" })
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 85 })
    .toBuffer();
  return { buffer, name: createHash("sha256").update(buffer).digest("hex").slice(0, 32) };
}
