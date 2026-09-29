import { createServer, IncomingMessage, ServerResponse } from "http";
import { URL } from "url";
import next from "next";
import { initSocket } from "./server/socket";
import { createReadStream, statSync, existsSync } from "fs";
import path from "path";

const dev = process.env.NODE_ENV !== "production";
const hostname = dev ? "localhost" : "0.0.0.0";
const port = parseInt(process.env.PORT || "3000", 10);

const app = next({ dev, hostname, port });
const handler = app.getRequestHandler();

const MIME_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".pdf": "application/pdf",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
};

function serveUploads(req: IncomingMessage, res: ServerResponse): boolean {
  const rawUrl = req.url || "";
  if (!rawUrl.startsWith("/uploads/")) return false;

  // Strip query string before resolving path
  const urlPath = rawUrl.split("?")[0];

  // Prevent directory traversal
  const decoded = decodeURIComponent(urlPath);
  if (decoded.includes("..") || decoded.includes("\\")) {
    res.writeHead(403);
    res.end("Forbidden");
    return true;
  }

  const filePath = path.join(process.cwd(), "public", decoded);

  try {
    if (!existsSync(filePath)) {
      console.log(`[uploads] 404: ${filePath}`);
      res.writeHead(404);
      res.end("Not Found");
      return true;
    }

    const stat = statSync(filePath);
    if (!stat.isFile()) {
      res.writeHead(404);
      res.end("Not Found");
      return true;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";

    // Range support: without it browsers cannot seek in a video, and Safari/iOS
    // refuses to play a video that is served without byte ranges at all.
    const baseHeaders = {
      "Content-Type": contentType,
      "Accept-Ranges": "bytes",
      "Cache-Control": "public, max-age=31536000, immutable",
    };
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || "");
    if (range && (range[1] || range[2])) {
      let start = range[1] ? parseInt(range[1], 10) : stat.size - parseInt(range[2], 10);
      let end = range[1] && range[2] ? parseInt(range[2], 10) : stat.size - 1;
      start = Math.max(0, start);
      end = Math.min(end, stat.size - 1);
      if (start > end || start >= stat.size) {
        res.writeHead(416, { "Content-Range": `bytes */${stat.size}` });
        res.end();
        return true;
      }
      res.writeHead(206, {
        ...baseHeaders,
        "Content-Range": `bytes ${start}-${end}/${stat.size}`,
        "Content-Length": end - start + 1,
      });
      createReadStream(filePath, { start, end }).pipe(res);
      return true;
    }

    res.writeHead(200, { ...baseHeaders, "Content-Length": stat.size });
    createReadStream(filePath).pipe(res);
    return true;
  } catch (err) {
    console.error(`[uploads] Error serving ${filePath}:`, err);
    res.writeHead(500);
    res.end("Internal Server Error");
    return true;
  }
}

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    // Serve uploaded files directly (not through Next.js)
    if (serveUploads(req, res)) return;
    handler(req, res);
  });

  initSocket(httpServer);

  httpServer.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
  });
});
