/* "Download the app" helpers: platform detection by user agent, own-platform-first order, size text, dl-info.json
   validation, the FomoDesktop/ marker and the "no PWA install inside the apps" rule.
   Run: npx tsx scripts/check-downloads.ts   (exit code 1 on a failed assertion) */
import { DL_INFO, DL_PATHS, detectPlatform, dlMeta, formatSize, parseDlInfo, platformOrder } from "../src/lib/downloads";
import { isAnyNativeShell, isDesktopApp, isNativeApp } from "../src/lib/native-app";

let fails = 0;
function eq(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
}

const UA = {
  android: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36",
  androidApp: "Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.0.0 Mobile Safari/537.36 FomoApp/1.0.0 Android",
  iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  ipad: "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  ipadAsMac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  windows: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  desktopApp: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.7977.130 Safari/537.36 FomoDesktop/1.0.0 Windows",
  winPhone: "Mozilla/5.0 (Windows Phone 10.0; Android 6.0.1; Microsoft; Lumia 950) AppleWebKit/537.36 Chrome/52.0.2743.116 Mobile Safari/537.36 Edge/15.15254",
  mac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  linux: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
};

// --- platform detection
eq("Android phone", detectPlatform({ userAgent: UA.android }), "android");
eq("Android app", detectPlatform({ userAgent: UA.androidApp }), "android");
eq("iPhone", detectPlatform({ userAgent: UA.iphone }), "ios");
eq("iPad", detectPlatform({ userAgent: UA.ipad }), "ios");
eq("iPadOS Safari that says Mac, touch screen", detectPlatform({ userAgent: UA.ipadAsMac, platform: "MacIntel", maxTouchPoints: 5 }), "ios");
eq("real Mac (no touch) is not iOS", detectPlatform({ userAgent: UA.mac, platform: "MacIntel", maxTouchPoints: 0 }), "other");
eq("Windows desktop", detectPlatform({ userAgent: UA.windows, platform: "Win32" }), "windows");
eq("Windows desktop app", detectPlatform({ userAgent: UA.desktopApp }), "windows");
eq("Windows Phone is not Windows", detectPlatform({ userAgent: UA.winPhone }), "android"); // its UA says Android; never "windows"
eq("Linux -> other", detectPlatform({ userAgent: UA.linux }), "other");
eq("empty UA -> other", detectPlatform({ userAgent: "" }), "other");

// --- order: own platform first, nothing lost
eq("order for other", platformOrder("other"), ["android", "windows", "ios"]);
eq("order for windows", platformOrder("windows"), ["windows", "android", "ios"]);
eq("order for ios", platformOrder("ios"), ["ios", "android", "windows"]);
eq("order for android", platformOrder("android"), ["android", "windows", "ios"]);

// --- sizes
eq("size KB", formatSize(900 * 1024, "en"), "900 KB");
eq("size small MB ru", formatSize(1596856, "ru"), "1,5 МБ");
eq("size small MB en", formatSize(1596856, "en"), "1.5 MB");
eq("size large MB", formatSize(94224205, "ru"), "90 МБ");
eq("size zero / NaN -> empty", [formatSize(0, "ru"), formatSize(NaN, "ru")], ["", ""]);

// --- dl-info.json validation: bad numbers are dropped, never shown
eq("valid info", parseDlInfo({ android: { version: "1.2.3", size: 100000 }, windows: { version: "2.0", size: 5000000 } }), { android: { version: "1.2.3", size: 100000 }, windows: { version: "2.0", size: 5000000 } });
eq("garbage info", parseDlInfo({ android: { version: "x", size: 1 }, windows: { version: "1.0.0", size: -5 } }), { android: null, windows: null });
eq("null / string info", [parseDlInfo(null), parseDlInfo("x")], [{ android: null, windows: null }, { android: null, windows: null }]);
eq("meta text", dlMeta("android", "ru", { android: { version: "1.0.0", size: 1596856 }, windows: null }), "v1.0.0 · 1,5 МБ");
eq("meta without info", dlMeta("windows", "ru", { android: null, windows: null }), "");
eq("meta for iOS is empty", dlMeta("ios", "ru"), "");
eq("committed dl-info.json is valid", [DL_INFO.android !== null, DL_INFO.windows !== null], [true, true]);
eq("file links", DL_PATHS, { android: "/app/dl/FOMO.apk", windows: "/app/dl/FOMO-Setup.exe" });

// --- shell detection (isDesktopApp / isAnyNativeShell read navigator and window)
const g = globalThis as unknown as { navigator?: unknown; window?: unknown };
function withUA(ua: string, bridge: boolean, fn: () => void) {
  const prev = { navigator: g.navigator, window: g.window };
  Object.defineProperty(g, "navigator", { value: { userAgent: ua }, configurable: true });
  g.window = bridge ? { FomoApp: {} } : {};
  try {
    fn();
  } finally {
    Object.defineProperty(g, "navigator", { value: prev.navigator, configurable: true });
    g.window = prev.window;
  }
}
withUA(UA.desktopApp, false, () => eq("desktop app: isDesktopApp + shell, not Android app", [isDesktopApp(), isNativeApp(), isAnyNativeShell()], [true, false, true]));
withUA(UA.androidApp, false, () => eq("android app by UA", [isDesktopApp(), isNativeApp(), isAnyNativeShell()], [false, true, true]));
withUA(UA.android, true, () => eq("android bridge without UA marker", [isDesktopApp(), isNativeApp(), isAnyNativeShell()], [false, true, true]));
withUA(UA.windows, false, () => eq("plain browser is no shell", [isDesktopApp(), isNativeApp(), isAnyNativeShell()], [false, false, false]));
withUA("Mozilla/5.0 NotFomoDesktop/1 Windows", false, () => eq("marker needs a word boundary", isDesktopApp(), false));

console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
