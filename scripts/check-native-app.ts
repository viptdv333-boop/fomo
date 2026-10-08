/* Android-app glue on the site side: native payload -> File, name hygiene, share detail, event wiring.
   Run: npx tsx scripts/check-native-app.ts   (exit code 1 on a failed assertion) */
import {
  canOpenNativeSettings,
  canSetNativeImmersive,
  setNativeImmersive,
  nativeAppFeatures,
  openNativeSettings,
  parseAppFeatures,
  NATIVE_MAX_BYTES,
  NATIVE_MAX_FILES,
  base64ToBytes,
  fileFromNativePayload,
  nativeShareFromDetail,
  normalizeNativeName,
  onNativePaste,
  onNativeShare,
  readNativeClipboardImage,
} from "../src/lib/native-app";
import { SAVE_CHUNK_BYTES, SAVE_NAME_MAX, SAVE_SINGLE_MAX_BYTES, bytesToBase64, canSaveNativeFile, sanitizeSaveName, saveBlobAsFile, saveDataUrlAsFile } from "../src/lib/save-file";

let fails = 0;
function eq(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
}

const PNG_B64 = "iVBORw0KGgo="; // 8 bytes: PNG signature
const NOW = new Date(2026, 9, 6, 12, 34, 56).getTime();

async function main() {
  // --- base64
  eq("base64 ok", Array.from(base64ToBytes(PNG_B64) ?? []), [137, 80, 78, 71, 13, 10, 26, 10]);
  eq("base64 rejects garbage", base64ToBytes("not base64!!"), null);
  eq("base64 rejects empty / non-string", [base64ToBytes(""), base64ToBytes(null), base64ToBytes(5)], [null, null, null]);
  eq("base64 rejects oversize", base64ToBytes("A".repeat(Math.ceil((NATIVE_MAX_BYTES * 4) / 3) + 100)), null);

  // --- names
  eq("generic image name -> screenshot-<stamp>", normalizeNativeName("image.png", "image/png", NOW), "screenshot-20261006-123456.png");
  eq("empty image name", normalizeNativeName("", "image/jpeg", NOW), "screenshot-20261006-123456.jpg");
  eq("content_123 is generic", normalizeNativeName("content_123", "image/webp", NOW), "screenshot-20261006-123456.webp");
  eq("real name is kept", normalizeNativeName("chart BTC.png", "image/png", NOW), "chart BTC.png");
  eq("path stripped", normalizeNativeName("../../etc/passwd.png", "image/png", NOW), "passwd.png");
  eq("windows path stripped", normalizeNativeName("C:\\x\\y\\report.pdf", "application/pdf", NOW), "report.pdf");
  eq("control chars stripped", normalizeNativeName("a\u0000b\nc.txt", "text/plain", NOW), "abc.txt");
  eq("non-image without name", normalizeNativeName(undefined, "application/pdf", NOW), "file-20261006-123456.pdf");
  eq("name length capped", normalizeNativeName("x".repeat(500) + ".png", "image/png", NOW).length <= 120, true);

  // --- payload -> File
  const f = fileFromNativePayload({ name: "image.png", type: "image/png", dataBase64: PNG_B64 }, NOW);
  eq("file name / type / size", f && [f.name, f.type, f.size], ["screenshot-20261006-123456.png", "image/png", 8]);
  if (f) eq("file bytes", Array.from(new Uint8Array(await f.arrayBuffer())), [137, 80, 78, 71, 13, 10, 26, 10]);
  eq("bad type rejected", fileFromNativePayload({ type: "nonsense", dataBase64: PNG_B64 }), null);
  eq("type with params rejected", fileFromNativePayload({ type: "image/png; x=y", dataBase64: PNG_B64 }), null);
  eq("missing data rejected", fileFromNativePayload({ type: "image/png" }), null);
  eq("null / string payload rejected", [fileFromNativePayload(null), fileFromNativePayload("x")], [null, null]);
  eq("type is lower-cased", fileFromNativePayload({ type: "IMAGE/PNG", dataBase64: PNG_B64 }, NOW)?.type, "image/png");

  // --- share detail
  const many = Array.from({ length: NATIVE_MAX_FILES + 3 }, (_, i) => ({ name: `f${i}.png`, type: "image/png", dataBase64: PNG_B64 }));
  const s = nativeShareFromDetail({ files: [...many, { type: "bad", dataBase64: "!" }], text: "hello", title: "t" }, NOW);
  eq("share: files capped, text kept", [s.files.length, s.text, s.title], [NATIVE_MAX_FILES, "hello", "t"]);
  eq("share: junk detail", nativeShareFromDetail("x"), { files: [], text: "", title: "" });
  eq("share: text capped", nativeShareFromDetail({ text: "a".repeat(20000) }).text.length, 8000);
  eq("share: bad files skipped", nativeShareFromDetail({ files: [{ type: "bad" }, null, 3] }).files.length, 0);

  // --- bridge reading (no window in Node -> no bridge)
  eq("no bridge -> empty", readNativeClipboardImage(), { file: null, why: "" });

  // --- events (a minimal document)
  const doc = new EventTarget();
  (globalThis as unknown as { document: unknown }).document = doc;
  (globalThis as unknown as { window: unknown }).window = { };
  const got: string[] = [];
  const off = onNativePaste((file) => got.push(file.name));
  doc.dispatchEvent(new CustomEvent("fomo-native-paste", { detail: { name: "image.png", type: "image/png", dataBase64: PNG_B64 } }));
  doc.dispatchEvent(new CustomEvent("fomo-native-paste", { detail: { type: "image/png" } })); // malformed: ignored
  off();
  doc.dispatchEvent(new CustomEvent("fomo-native-paste", { detail: { name: "after.png", type: "image/png", dataBase64: PNG_B64 } }));
  eq("paste event delivered once, malformed ignored, unsubscribed", got.length, 1);

  // share: pending value taken on subscribe, then cleared; live events too
  const w = (globalThis as unknown as { window: { __fomoNativeShare?: unknown } }).window;
  w.__fomoNativeShare = { text: "pending", files: [] };
  const shares: string[] = [];
  const off2 = onNativeShare((x) => shares.push(x.text));
  eq("pending share taken and cleared", [shares, w.__fomoNativeShare], [["pending"], undefined]);
  doc.dispatchEvent(new CustomEvent("fomo-native-share", { detail: { text: "live", files: [] } }));
  doc.dispatchEvent(new CustomEvent("fomo-native-share", { detail: {} })); // nothing to share: ignored
  off2();
  eq("live share event", shares, ["pending", "live"]);

  // --- native settings / app features (feature detection must never throw and must be false outside the app)
  const full = JSON.stringify({ schema: 1, versionName: "1.0.0", versionCode: 1, settings: true, appLock: true, lockEnabled: false, notificationChannels: true, updateCheck: true, immersive: true, saveFile: true });
  eq("features parsed", parseAppFeatures(full), { schema: 1, versionName: "1.0.0", versionCode: 1, settings: true, appLock: true, lockEnabled: false, notificationChannels: true, updateCheck: true, immersive: true, saveFile: true });
  eq("features: junk -> null", [parseAppFeatures(""), parseAppFeatures("nope"), parseAppFeatures("[1]"), parseAppFeatures("null"), parseAppFeatures(5), parseAppFeatures(undefined)], [null, null, null, null, null, null]);
  eq("features: too long -> null", parseAppFeatures("{" + " ".repeat(5000) + "}"), null);
  eq("features: missing / wrong-typed fields are false", parseAppFeatures('{"settings":"yes","appLock":1}')?.settings, false);
  eq("features: only strict true counts", parseAppFeatures('{"settings":true}')?.settings, true);
  eq("no bridge -> no native settings", [canOpenNativeSettings(), openNativeSettings(), nativeAppFeatures()], [false, false, null]);
  const win = (globalThis as unknown as { window: { FomoApp?: unknown } }).window;
  win.FomoApp = { appVersion: () => "0.9" }; // an old app build without openSettings: entry stays hidden
  eq("old app build -> hidden", [canOpenNativeSettings(), openNativeSettings()], [false, false]);
  let opened = 0;
  win.FomoApp = { openSettings: () => { opened++; } }; // new bridge without appFeatures: trust openSettings
  eq("openSettings only -> available", [canOpenNativeSettings(), openNativeSettings(), opened], [true, true, 1]);
  win.FomoApp = { openSettings: () => { opened++; }, appFeatures: () => '{"settings":false}' };
  eq("features say no settings -> hidden", canOpenNativeSettings(), false);
  win.FomoApp = { openSettings: () => { opened++; }, appFeatures: () => full };
  eq("features say settings -> available", canOpenNativeSettings(), true);
  win.FomoApp = { openSettings: () => { throw new Error("boom"); }, appFeatures: () => { throw new Error("boom"); } };
  eq("throwing bridge never throws", [nativeAppFeatures(), openNativeSettings()], [null, false]);
  // --- immersive mode (the full-screen chart): only a build that says so is called, nothing ever throws
  eq("no bridge -> no immersive", [canSetNativeImmersive(), setNativeImmersive(true)], [false, false]);
  const calls: boolean[] = [];
  win.FomoApp = { setImmersive: (on: boolean) => { calls.push(on); } }; // no appFeatures: not trusted, the old fallback path is used
  eq("method without features -> not used", [canSetNativeImmersive(), setNativeImmersive(true), calls], [false, false, []]);
  win.FomoApp = { setImmersive: (on: boolean) => { calls.push(on); }, appFeatures: () => '{"immersive":false}' };
  eq("features say no immersive -> not used", [canSetNativeImmersive(), setNativeImmersive(true), calls], [false, false, []]);
  win.FomoApp = { appFeatures: () => full }; // the flag without the method (cannot happen in a real build)
  eq("flag without method -> not used", canSetNativeImmersive(), false);
  win.FomoApp = { setImmersive: (on: boolean) => { calls.push(on); }, appFeatures: () => full };
  eq("new app -> on and off reach the bridge, strictly boolean", [canSetNativeImmersive(), setNativeImmersive(true), setNativeImmersive(false), calls], [true, true, true, [true, false]]);
  win.FomoApp = { setImmersive: () => { throw new Error("boom"); }, appFeatures: () => full };
  eq("throwing setImmersive -> false", setNativeImmersive(true), false);
  delete win.FomoApp;

  // --- saving files the page builds (chart CSV / screenshot): sanitizer, base64, bridge vs anchor
  eq("save name: kept", [sanitizeSaveName("SBER_1h.csv", "text/csv"), sanitizeSaveName("Отчёт 2026.csv")], ["SBER_1h.csv", "Отчёт 2026.csv"]);
  eq("save name: path / reserved / control", [sanitizeSaveName("../../etc/passwd"), sanitizeSaveName("C:\\x\\evil.csv"), sanitizeSaveName("a<b>c.csv"), sanitizeSaveName("a\u0000b\n.csv")], ["passwd", "evil.csv", "a_b_c.csv", "ab.csv"]);
  eq("save name: leading / trailing dots", [sanitizeSaveName("...hidden.csv"), sanitizeSaveName("trail. . ")], ["hidden.csv", "trail"]);
  eq("save name: empty -> download + ext from type", [sanitizeSaveName("", "text/csv;charset=utf-8"), sanitizeSaveName(undefined, "image/png"), sanitizeSaveName("///"), sanitizeSaveName("data", "text/csv"), sanitizeSaveName("data.bin", "text/csv")], ["download.csv", "download.png", "download", "data.csv", "data.bin"]);
  const longName = sanitizeSaveName("x".repeat(300) + ".csv", "text/csv");
  eq("save name: long name capped, extension kept", [longName.length, longName.endsWith(".csv"), sanitizeSaveName("y".repeat(300)).length], [SAVE_NAME_MAX, true, SAVE_NAME_MAX]);
  eq("bytesToBase64", [bytesToBase64(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])), bytesToBase64(new Uint8Array([])), bytesToBase64(new Uint8Array([1]))], [PNG_B64, "", "AQ=="]);
  const big = new Uint8Array(200000).map((_, i) => i % 251);
  eq("bytesToBase64 round trip on a big array (no stack overflow)", Array.from(base64ToBytes(bytesToBase64(big)) ?? []).length, big.length);
  eq("save chunk size is a multiple of 3 (self-contained base64 pieces)", [SAVE_CHUNK_BYTES % 3, SAVE_SINGLE_MAX_BYTES % 3], [0, 0]);

  // no bridge -> the standard <a download> with the sanitized name
  const anchors: Array<{ href: string; download: string }> = [];
  const docAny = doc as unknown as Record<string, unknown>;
  docAny.createElement = () => ({ href: "", download: "", rel: "", click() { anchors.push({ href: this.href, download: this.download }); }, remove() {} });
  docAny.body = { appendChild() {} };
  eq("no bridge -> cannot save natively", canSaveNativeFile(), false);
  eq("no bridge -> anchor download", [await saveBlobAsFile(new Blob(["a,b\n1,2\n"], { type: "text/csv;charset=utf-8" }), "SBER_1h.csv"), anchors.length, anchors[0]?.download, anchors[0]?.href.startsWith("blob:")], [true, 1, "SBER_1h.csv", true]);
  eq("data: URL without bridge -> anchor", [await saveDataUrlAsFile("data:image/png;base64," + PNG_B64, "x.png"), anchors.length, anchors[1]?.download], [true, 2, "x.png"]);

  // a bridge with the saveFile feature: bytes go through it, never through an anchor
  const sent: { name: string; mime: string; b64: string }[] = [];
  const chunks: string[] = [];
  const calls2: string[] = [];
  const bridge: Record<string, unknown> = {
    appFeatures: () => full,
    saveFile: (name: string, mime: string, b64: string) => { sent.push({ name, mime, b64 }); return "ok"; },
    saveFileBegin: (name: string, mime: string) => { calls2.push(`begin ${name} ${mime}`); return "ok:tok1"; },
    saveFileChunk: (t: string, b64: string) => { chunks.push(t + ":" + b64); return "ok"; },
    saveFileEnd: (t: string) => { calls2.push("end " + t); return "ok"; },
    saveFileFailed: (t: string) => { calls2.push("failed " + t); },
  };
  win.FomoApp = bridge;
  eq("bridge + feature -> native save", canSaveNativeFile(), true);
  const csv = "time_msk,open\n2026-01-01 10:00:00,1\n";
  eq("small file -> one saveFile call", [await saveBlobAsFile(new Blob([csv], { type: "text/csv;charset=utf-8" }), "../SBER_1h.csv"), sent.length, sent[0]?.name, sent[0]?.mime, Buffer.from(sent[0]?.b64 ?? "", "base64").toString("utf8"), anchors.length], [true, 1, "SBER_1h.csv", "text/csv;charset=utf-8", csv, 2]);
  const bigBlob = new Blob([big, big, big, big], { type: "application/octet-stream" }); // 800 000 bytes > single limit
  const okBig = await saveBlobAsFile(bigBlob, "big.bin");
  const joined = Buffer.concat(chunks.map((c) => Buffer.from(c.split(":")[1], "base64")));
  eq("big file -> begin, chunks (each valid base64 of its own), end", [okBig, calls2[0], calls2[calls2.length - 1], chunks.length, chunks.every((c) => c.startsWith("tok1:") && c.split(":")[1].length % 4 === 0), joined.length], [true, "begin big.bin application/octet-stream", "end tok1", Math.ceil(800000 / SAVE_CHUNK_BYTES), true, 800000]);
  eq("big file bytes survive the chunking", Buffer.compare(joined, Buffer.concat([big, big, big, big].map((b) => Buffer.from(b)))), 0);
  eq("bridge save never used an anchor", anchors.length, 2);
  chunks.length = 0;
  calls2.length = 0;
  eq("empty blob -> begin + end", [await saveBlobAsFile(new Blob([]), "empty.csv"), calls2], [true, ["begin empty.csv application/octet-stream", "end tok1"]]);
  win.FomoApp = { ...bridge, saveFile: () => "io" };
  eq("native error -> false, no anchor fallback", [await saveBlobAsFile(new Blob(["x"], { type: "text/plain" }), "a.txt"), anchors.length], [false, 2]);
  win.FomoApp = { ...bridge, saveFileChunk: () => "io" };
  eq("chunk error -> false", await saveBlobAsFile(bigBlob, "big.bin"), false);
  win.FomoApp = { ...bridge, saveFileBegin: () => "busy" };
  eq("begin error -> false", await saveBlobAsFile(bigBlob, "big.bin"), false);
  win.FomoApp = { ...bridge, saveFile: () => { throw new Error("boom"); } };
  eq("throwing bridge -> false, never throws", await saveBlobAsFile(new Blob(["x"]), "a.txt"), false);
  win.FomoApp = { ...bridge, appFeatures: () => '{"saveFile":false}' }; // old build / no feature -> anchor
  eq("feature flag off -> anchor", [canSaveNativeFile(), await saveBlobAsFile(new Blob(["x"], { type: "text/plain" }), "a.txt"), anchors.length], [false, true, 3]);
  win.FomoApp = { saveFile: bridge.saveFile, saveFileBegin: bridge.saveFileBegin }; // methods without appFeatures: not trusted
  eq("methods without features -> not used", canSaveNativeFile(), false);
  delete win.FomoApp;

  console.log(fails ? `\n${fails} FAILED` : "\nall passed");
  process.exit(fails ? 1 : 0);
}
main();
