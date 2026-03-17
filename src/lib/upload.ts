import sharp from "sharp";
import { randomUUID } from "crypto";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

type UploadType = "avatars" | "ideas" | "receipts" | "messages";

const SIZE_LIMITS: Record<UploadType, number> = {
  avatars: 5 * 1024 * 1024, // 5MB
  ideas: 10 * 1024 * 1024, // 10MB
  receipts: 5 * 1024 * 1024, // 5MB
  messages: 15 * 1024 * 1024, // 15MB
};

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/webm"];
const ALLOWED_AUDIO_TYPES = ["audio/mpeg", "audio/ogg", "audio/wav", "audio/mp4"];
const ALLOWED_DOC_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/zip",
  "application/x-rar-compressed",
  "text/plain",
];

export async function saveUploadedFile(
  file: File,
  type: UploadType,
  userId: string
): Promise<{ url: string; name: string; fileType: string }> {
  const buffer = Buffer.from(await file.arrayBuffer());

  if (buffer.length > SIZE_LIMITS[type]) {
    throw new Error(`File too large. Max ${SIZE_LIMITS[type] / 1024 / 1024}MB`);
  }

  const isImage = ALLOWED_IMAGE_TYPES.includes(file.type);
  const isVideo = ALLOWED_VIDEO_TYPES.includes(file.type);
  const isAudio = ALLOWED_AUDIO_TYPES.includes(file.type);
  const isDoc = ALLOWED_DOC_TYPES.includes(file.type);

  if (type === "avatars" && !isImage) {
    throw new Error("Only images allowed for avatars");
  }
  if (type === "receipts" && !isImage) {
    throw new Error("Only images allowed for receipts");
  }
  if (type === "ideas" && !isImage && !isVideo && !isAudio) {
    throw new Error("Only media files allowed (photo/video/audio)");
  }
  if (type === "messages" && !isImage && !isVideo && !isAudio && !isDoc) {
    throw new Error("Unsupported file type");
  }

  const uuid = randomUUID();
  const dir = path.join(process.cwd(), "public", "uploads", type, userId);
  await mkdir(dir, { recursive: true });

  if (isImage) {
    try {
      console.log(`[upload] Processing image: ${file.name} (${buffer.length} bytes, type: ${file.type})`);
      let processed: Buffer;
      if (type === "avatars") {
        processed = await sharp(buffer)
          .rotate()
          .resize(200, 200, { fit: "cover" })
          .jpeg({ quality: 85 })
          .toBuffer();
      } else if (type === "messages") {
        processed = await sharp(buffer)
          .rotate()
          .resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
          .jpeg({ quality: 85 })
          .toBuffer();
      } else {
        processed = await sharp(buffer)
          .rotate()
          .resize(1200, 1200, { fit: "inside", withoutEnlargement: true })
          .jpeg({ quality: 85 })
          .toBuffer();
      }

      const filename = `${uuid}.jpg`;
      const fullPath = path.join(dir, filename);
      await writeFile(fullPath, processed);
      console.log(`[upload] OK: ${fullPath} (${processed.length} bytes)`);
      return {
        url: `/uploads/${type}/${userId}/${filename}`,
        name: file.name,
        fileType: "image",
      };
    } catch (err) {
      console.error("[upload] Sharp failed, saving original:", err);
      // Fallback: save original image without processing
      const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : file.type === "image/gif" ? "gif" : "jpg";
      const filename = `${uuid}.${ext}`;
      await writeFile(path.join(dir, filename), buffer);
      console.log(`[upload] Saved original: ${path.join(dir, filename)}`);
      return {
        url: `/uploads/${type}/${userId}/${filename}`,
        name: file.name,
        fileType: "image",
      };
    }
  }

  if (isVideo) {
    const ext = file.type === "video/webm" ? "webm" : "mp4";
    const filename = `${uuid}.${ext}`;
    await writeFile(path.join(dir, filename), buffer);
    return {
      url: `/uploads/${type}/${userId}/${filename}`,
      name: file.name,
      fileType: "video",
    };
  }

  if (isAudio) {
    const ext = file.type === "audio/ogg" ? "ogg" : file.type === "audio/wav" ? "wav" : "mp3";
    const filename = `${uuid}.${ext}`;
    await writeFile(path.join(dir, filename), buffer);
    return {
      url: `/uploads/${type}/${userId}/${filename}`,
      name: file.name,
      fileType: "audio",
    };
  }

  // Documents — save as-is with original extension
  const origExt = file.name.split(".").pop() || "bin";
  const filename = `${uuid}.${origExt}`;
  await writeFile(path.join(dir, filename), buffer);
  return {
    url: `/uploads/${type}/${userId}/${filename}`,
    name: file.name,
    fileType: "document",
  };
}
