/** Browser side of the large video upload (see src/lib/large-upload.ts for the server and the rules). */

export const SMALL_MB = 10;

export type UploadFailKind = "too_large" | "network" | "busy" | "rate" | "type" | "space" | "cancelled" | "generic";

export class UploadFail extends Error {
  constructor(public kind: UploadFailKind, public maxMb?: number) {
    super(kind);
    this.name = "UploadFail";
  }
}

/** How many MB this account may upload as one file (10 for most, 500 for channel owners and staff). Falls back to 10 on any problem. */
export async function fetchUploadLimitMb(): Promise<number> {
  try {
    const res = await fetch("/api/upload/stream", { cache: "no-store", credentials: "same-origin" });
    if (!res.ok) return SMALL_MB;
    const data = await res.json();
    const mb = Number(data?.maxMb);
    return Number.isFinite(mb) && mb >= SMALL_MB ? mb : SMALL_MB;
  } catch {
    return SMALL_MB;
  }
}

function failFromResponse(status: number, body: any): UploadFail {
  const code = body && typeof body.error === "string" ? body.error : "";
  if (status === 413 || code === "too_large") return new UploadFail("too_large", Number(body?.maxMb) || undefined);
  if (status === 415 || code === "bad_type") return new UploadFail("type");
  if (status === 507 || code === "no_space") return new UploadFail("space");
  if (status === 503 || code === "user_busy" || code === "server_busy") return new UploadFail("busy");
  if (status === 429) return new UploadFail(code === "user_busy" ? "busy" : "rate");
  if (status === 408) return new UploadFail("network");
  return new UploadFail("generic");
}

/**
 * PUTs the file as the raw request body with XMLHttpRequest (fetch has no upload progress). No timeout: a 200 MB file on a slow link
 * takes as long as it takes. `cancel()` aborts the request, the server then removes the half-written file.
 */
export function uploadVideoStream(
  file: File,
  onProgress: (pct: number) => void
): { promise: Promise<{ url: string; name: string }>; cancel: () => void } {
  const xhr = new XMLHttpRequest();
  const promise = new Promise<{ url: string; name: string }>((resolve, reject) => {
    xhr.open("PUT", "/api/upload/stream");
    xhr.timeout = 0;
    xhr.responseType = "text";
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.setRequestHeader("X-File-Name", encodeURIComponent(file.name));
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) onProgress(Math.min(100, Math.floor((e.loaded / e.total) * 100)));
    };
    xhr.onload = () => {
      let body: any = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        // not JSON (a proxy error page): handled by the status below
      }
      if (xhr.status >= 200 && xhr.status < 300 && body?.url) {
        onProgress(100);
        resolve({ url: body.url, name: body.name || file.name });
      } else {
        reject(failFromResponse(xhr.status, body));
      }
    };
    xhr.onerror = () => reject(new UploadFail("network"));
    xhr.ontimeout = () => reject(new UploadFail("network"));
    xhr.onabort = () => reject(new UploadFail("cancelled"));
    xhr.send(file);
  });
  return { promise, cancel: () => xhr.abort() };
}
