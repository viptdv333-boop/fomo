import sharp from "sharp";
import { randomUUID } from "crypto";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

type UploadType = "avatars" | "ideas" | "receipts" | "messages";

const SIZE_LIMITS: Record<UploadType, number> = {
  avatars: 2 * 1024 * 1024, // 2MB
  ideas: 10 * 1024 * 1024, // 10MB
  receipts: 5 * 1024 * 1024, // 5MB
  messages: 15 * 1024 * 1024, // 15MB
};

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/webm"];
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
  const isDoc = ALLOWED_DOC_TYPES.includes(file.type);

  if (type === "avatars" && !isImage) {
    throw new Error("Only images allowed for avatars");
  }
  if (type === "receipts" && !isImage) {
    throw new Error("Only images allowed for receipts");
  }
  if (type === "ideas" && !isImage && !isVideo) {
    throw new Error("Only images and videos allowed");
  }
  if (type === "messages" && !isImage && !isVideo && !isDoc) {
    throw new Error("Unsupported file type");
  }

  const uuid = randomUUID();
  const dir = path.join(process.cwd(), "public", "uploads", type, userId);
  await mkdir(dir, { recursive: true });

  if (isImage) {
    let processed: Buffer;
    if (type === "avatars") {
      processed = await sharp(buffer)
        .resize(200, 200, { fit: "cover" })
        .jpeg({ quality: 85 })
        .toBuffer();
    } else if (type === "messages") {
      // For messages, keep larger but still optimize
      processed = await sharp(buffer)
        .resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toBuffer();
    } else {
      processed = await sharp(buffer)
        .resize(1200, 1200, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toBuffer();
    }

    const filename = `${uuid}.jpg`;
    await writeFile(path.join(dir, filename), processed);
    return {
      url: `/uploads/${type}/${userId}/${filename}`,
      name: file.name,
      fileType: "image",
    };
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
