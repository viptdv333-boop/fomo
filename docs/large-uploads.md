# Large video uploads (up to 500 MB)

Channel owners and staff (ADMIN / OWNER accounts, and any account that owns a channel, i.e. has a subscription tariff) can attach a
video of up to **500 MB** (MP4 / WebM) to a post. Everybody else keeps the 10 MB limit of `/api/upload`.

## How it works

- `POST /api/upload` (multipart, `request.formData()`) keeps the file in memory, so it stays at 10 MB (100 MB for chat messages).
- `PUT /api/upload/stream` (`src/app/api/upload/stream/route.ts`, logic in `src/lib/large-upload.ts`) takes the file as the **raw request
  body** (`Content-Type: video/mp4|video/webm`, file name URL-encoded in `X-File-Name`) and pipes it to disk chunk by chunk:
  `Readable.fromWeb(body) -> VideoGuard -> fs.WriteStream`. Memory use does not depend on the file size (150 MB test: +28 MB RSS).
  - `VideoGuard` counts the bytes (stops at the limit), checks the first bytes (`ftyp` for MP4, `1A 45 DF A3` for WebM) against the
    declared type before anything is written, and cuts a sender that sends nothing for 2 minutes.
  - the bytes go to `public/uploads/ideas/<userId>/<uuid>.<ext>.part` and are renamed when complete; a failed or cancelled upload
    leaves nothing behind.
  - limits: `Content-Length` over the account's maximum is refused before reading (413); at most 2 large uploads at once per process,
    1 per user; 20 attempts per user per hour (`src/lib/rate-limit.ts`); not enough free disk (file + 1 GB) -> 507.
- `GET /api/upload/stream` answers `{ "maxMb": 10 | 500 }` for the signed-in account; the post form uses it to pick the path and the hint.
- The Next middleware does not match `/api/upload`, the service worker never caches or queues `/api/upload/*` (`API_DENY`).
- `server.ts` sets `httpServer.requestTimeout` to 2 hours (Node's default of 5 minutes would cut a slow 500 MB upload).
- `/uploads/*` is served by `server.ts` with HTTP Range (206), so the player can seek in a large video.

## nginx (the server needs this once)

Put it **before / next to** the existing `location /` (an exact `=` match wins over prefix locations, so it also overrides an existing
`location /api/upload` for this one path). Use the same `proxy_pass` / headers as the main location.

```nginx
location = /api/upload/stream {
    client_max_body_size      520m;     # 500 MB + headers slack (the default 1m would answer 413)
    client_body_timeout       3600s;    # time between two reads of the body, not the whole upload
    proxy_request_buffering   off;      # stream the body to Node instead of spooling 500 MB into nginx's temp dir first
    proxy_http_version        1.1;
    proxy_read_timeout        3600s;
    proxy_send_timeout        3600s;

    proxy_pass http://127.0.0.1:3000;  # <- the same upstream as `location /`
    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

Then `nginx -t && systemctl reload nginx`. If the site sits behind Cloudflare (orange cloud), its request body limit (100 MB on the
free / Pro plans) applies before nginx: the upload host would have to be a DNS-only (grey cloud) record or the plan changed.

Tip: for training videos, `ffmpeg -i in.mp4 -c copy -movflags +faststart out.mp4` puts the index at the start, so playback begins at once.

## Checks

`npx tsx scripts/check-large-upload.ts` (byte counter, magic bytes, streaming write, access rules, slots).
