"use strict";
// FOMO for Windows / macOS: a thin Electron shell around https://fomo.spot, or (flavor "terminal", see flavors.js)
// around https://terminal.fomo.spot. Only the site's own origin stays inside the window; every other link opens in the
// default browser.
// Run: npm start (npm run start:terminal)   |   smoke test: npx electron . --smoke   |   build: npm run dist (see README.md)

const { app, BrowserWindow, Menu, shell, session, screen } = require("electron");
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

const flavors = require("./flavors");

// The flavor is baked into the packaged package.json (`fomoFlavor`, set by electron-builder.config.js); a dev run takes
// FOMO_FLAVOR / FLAVOR from the environment. Unknown values fall back to the main app.
const FLAVOR = flavors[process.env.FOMO_FLAVOR || process.env.FLAVOR || require("./package.json").fomoFlavor] || flavors.main;
const MAC = process.platform === "darwin";
const OS_TOKEN = MAC ? "Mac" : "Windows";

const SITE = FLAVOR.site;
const TRUSTED_HOSTS = new Set(FLAVOR.hosts);
const OFFLINE_FILE = path.join(__dirname, "offline.html");
const OFFLINE_URL = pathToFileURL(OFFLINE_FILE).href.split("?")[0];
const ICON = path.join(__dirname, FLAVOR.icon);
const BG = "#0a0a0a";
const SMOKE = process.argv.includes("--smoke");
const DEVTOOLS = process.argv.includes("--devtools");
const ZOOM_MIN = -3;
const ZOOM_MAX = 5;

// Web permissions the site may use. Everything else is denied, and everything is denied for foreign origins.
// "fullscreen" is there for the full-screen chart (Fullscreen API); "clipboard-sanitized-write" is the plain copy button.
const ALLOWED_PERMISSIONS = new Set(["notifications", "clipboard-read", "clipboard-sanitized-write", "media", "fullscreen"]);

// Own profile folder per flavor (%APPDATA%\FOMO, %APPDATA%\FOMO Terminal): the two apps never share cookies, a login or the
// window state. Set before anything reads userData (the single-instance lock and the session live there).
app.setPath("userData", path.join(app.getPath("appData"), FLAVOR.userDataDir));
app.setAppUserModelId(FLAVOR.appId);

// "<default UA> FomoDesktop/1.0.0 Windows" (or "... Mac"): the site detects the app by this marker. The Electron / app-name
// tokens are dropped so the UA looks like plain Chrome to the sites that sniff it.
app.userAgentFallback =
  app.userAgentFallback
    .replace(/\s+Electron\/\S+/i, "")
    .replace(/\s+(FOMO|FOMOTerminal|FOMO Terminal|fomo-desktop|fomo-terminal-desktop)\/\S+/gi, "") +
  " FomoDesktop/" + app.getVersion() + " " + OS_TOKEN;

/** True for a URL on the site's own origin (https only). */
function isTrustedUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && TRUSTED_HOSTS.has(u.hostname) && (u.port === "" || u.port === "443");
  } catch {
    return false;
  }
}

/** The local offline page (loaded from the app package), with or without its query string. */
function isOfflineUrl(url) {
  if (typeof url !== "string" || !url.startsWith("file:")) return false;
  const norm = (s) => {
    try {
      return decodeURI(s.split("?")[0].split("#")[0]).toLowerCase();
    } catch {
      return s.toLowerCase();
    }
  };
  return norm(url) === norm(OFFLINE_URL);
}

/** Hands a link to the default browser. Only https and mailto ever leave the app. */
function openExternalSafe(url) {
  try {
    const u = new URL(url);
    if (u.protocol === "https:" || u.protocol === "mailto:") void shell.openExternal(u.href);
  } catch {
    /* not a URL: ignore */
  }
}

// ---- window size / position ----------------------------------------------------------------------------------

function stateFile() {
  return path.join(app.getPath("userData"), "window-state.json");
}

function loadState() {
  const def = { width: 1280, height: 820, maximized: false, zoom: 0 };
  try {
    const s = JSON.parse(fs.readFileSync(stateFile(), "utf8"));
    const out = { ...def };
    if (Number.isFinite(s.width) && Number.isFinite(s.height)) {
      out.width = Math.max(400, Math.round(s.width));
      out.height = Math.max(600, Math.round(s.height));
    }
    if (Number.isFinite(s.x) && Number.isFinite(s.y)) {
      // restore the position only if the window would still be on a connected display
      const visible = screen.getAllDisplays().some((d) => {
        const b = d.workArea;
        return s.x + 100 > b.x && s.x < b.x + b.width - 100 && s.y >= b.y - 10 && s.y < b.y + b.height - 100;
      });
      if (visible) {
        out.x = Math.round(s.x);
        out.y = Math.round(s.y);
      }
    }
    out.maximized = s.maximized === true;
    if (Number.isFinite(s.zoom)) out.zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, s.zoom));
    return out;
  } catch {
    return def;
  }
}

function saveState(win, zoom) {
  try {
    if (win.isDestroyed()) return;
    const b = win.isMaximized() || win.isFullScreen() ? win.getNormalBounds() : win.getBounds();
    fs.writeFileSync(
      stateFile(),
      JSON.stringify({ x: b.x, y: b.y, width: b.width, height: b.height, maximized: win.isMaximized(), zoom })
    );
  } catch {
    /* a read-only profile must not break the app */
  }
}

// ---- main window -----------------------------------------------------------------------------------------------

let mainWindow = null;
let zoomLevel = 0;

function showOffline(win, failedUrl) {
  if (win.isDestroyed()) return;
  void win.loadFile(OFFLINE_FILE, { query: { u: failedUrl || SITE, site: SITE, name: FLAVOR.productName } });
}

function setZoom(win, level) {
  zoomLevel = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, level));
  win.webContents.setZoomLevel(zoomLevel);
}

/** Keyboard shortcuts. The menu is removed (no menu bar), so the standard ones are handled here. */
function handleShortcut(win, event, input) {
  if (input.type !== "keyDown") return;
  const key = input.key;
  // Ctrl on Windows, Cmd on a Mac
  const ctrl = MAC ? input.meta && !input.alt && !input.control : input.control && !input.alt && !input.meta;
  const k = typeof key === "string" ? key.toLowerCase() : "";
  if (key === "F5" || (ctrl && k === "r")) {
    event.preventDefault();
    if (input.shift) win.webContents.reloadIgnoringCache();
    else win.webContents.reload();
  } else if (key === "F11") {
    event.preventDefault();
    win.setFullScreen(!win.isFullScreen());
  } else if (key === "Escape" && win.isFullScreen()) {
    // Escape also leaves an HTML element's full screen; the window one is handled here
    event.preventDefault();
    win.setFullScreen(false);
  } else if (ctrl && (key === "+" || key === "=")) {
    event.preventDefault();
    setZoom(win, zoomLevel + 0.5);
  } else if (ctrl && (key === "-" || key === "_")) {
    event.preventDefault();
    setZoom(win, zoomLevel - 0.5);
  } else if (ctrl && key === "0") {
    event.preventDefault();
    setZoom(win, 0);
  } else if ((input.alt && key === "ArrowLeft") || (MAC && ctrl && key === "[")) {
    event.preventDefault();
    if (win.webContents.navigationHistory.canGoBack()) win.webContents.navigationHistory.goBack();
  } else if ((input.alt && key === "ArrowRight") || (MAC && ctrl && key === "]")) {
    event.preventDefault();
    if (win.webContents.navigationHistory.canGoForward()) win.webContents.navigationHistory.goForward();
  } else if (DEVTOOLS && ((ctrl && input.shift && k === "i") || key === "F12")) {
    event.preventDefault();
    win.webContents.toggleDevTools();
  }
}

function createWindow() {
  const st = loadState();
  zoomLevel = st.zoom;
  const win = new BrowserWindow({
    width: st.width,
    height: st.height,
    x: st.x,
    y: st.y,
    minWidth: 400,
    minHeight: 600,
    show: false,
    title: FLAVOR.productName,
    icon: ICON,
    backgroundColor: BG,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      devTools: DEVTOOLS,
    },
  });
  mainWindow = win;
  win.setMenuBarVisibility(false);
  if (st.maximized) win.maximize();

  win.once("ready-to-show", () => win.show());
  // the page <title> changes per route; the window keeps its name
  win.on("page-title-updated", (e) => e.preventDefault());

  const wc = win.webContents;
  wc.on("did-finish-load", () => {
    if (zoomLevel !== 0 && !isOfflineUrl(wc.getURL())) wc.setZoomLevel(zoomLevel);
  });
  wc.on("before-input-event", (event, input) => handleShortcut(win, event, input));
  wc.on("did-fail-load", (_e, code, _desc, url, isMainFrame) => {
    // -3 = ABORTED (a navigation replaced by another one), not a failure
    if (!isMainFrame || code === -3 || isOfflineUrl(url)) return;
    showOffline(win, url);
  });
  wc.on("render-process-gone", (_e, details) => {
    if (details.reason === "clean-exit" || win.isDestroyed()) return;
    showOffline(win, SITE);
  });
  wc.on("context-menu", (_e, params) => {
    const items = [];
    if (params.isEditable) {
      items.push({ role: "cut", label: "Вырезать" }, { role: "copy", label: "Копировать" }, { role: "paste", label: "Вставить" }, { type: "separator" }, { role: "selectAll", label: "Выделить всё" });
    } else if (params.selectionText) {
      items.push({ role: "copy", label: "Копировать" });
    }
    if (params.linkURL && /^(https|mailto):/i.test(params.linkURL)) {
      if (items.length) items.push({ type: "separator" });
      items.push({ label: "Открыть ссылку в браузере", click: () => openExternalSafe(params.linkURL) });
    }
    if (items.length) Menu.buildFromTemplate(items).popup({ window: win });
  });

  const persist = () => saveState(win, zoomLevel);
  win.on("close", persist);
  win.on("resized", persist);
  win.on("moved", persist);
  win.on("closed", () => {
    if (mainWindow === win) mainWindow = null;
  });

  void win.loadURL(SITE);
  return win;
}

// ---- security: navigation, new windows, permissions --------------------------------------------------------------

app.on("web-contents-created", (_e, contents) => {
  contents.on("will-attach-webview", (e) => e.preventDefault());

  const guard = (event, url) => {
    if (isTrustedUrl(url) || isOfflineUrl(url)) return;
    event.preventDefault();
    openExternalSafe(url);
  };
  contents.on("will-navigate", guard);
  contents.on("will-redirect", guard);

  contents.setWindowOpenHandler(({ url }) => {
    if (isTrustedUrl(url)) {
      // a link to another page of the site that wanted a new window: same window
      setImmediate(() => {
        if (!contents.isDestroyed()) void contents.loadURL(url);
      });
    } else {
      openExternalSafe(url);
    }
    return { action: "deny" };
  });
});

function setupPermissions() {
  const ses = session.defaultSession;
  const originOf = (wc, details) => {
    const u = (details && (details.requestingUrl || details.embeddingOrigin)) || (wc && wc.getURL()) || "";
    return u;
  };
  ses.setPermissionRequestHandler((wc, permission, callback, details) => {
    callback(ALLOWED_PERMISSIONS.has(permission) && isTrustedUrl(originOf(wc, details)));
  });
  ses.setPermissionCheckHandler((wc, permission, requestingOrigin, details) => {
    const url = requestingOrigin || (details && details.requestingUrl) || (wc && wc.getURL()) || "";
    return ALLOWED_PERMISSIONS.has(permission) && isTrustedUrl(url);
  });
}

// ---- smoke test: `electron . --smoke` -------------------------------------------------------------------------------

function runSmoke() {
  const out = (line) => {
    process.stdout.write(line + "\n");
    if (process.env.FOMO_SMOKE_OUT) {
      try {
        fs.appendFileSync(process.env.FOMO_SMOKE_OUT, line + "\n");
      } catch {
        /* ignore */
      }
    }
  };
  const win = new BrowserWindow({
    show: false,
    width: 800,
    height: 700,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  let done = false;
  const finish = (ok, why) => {
    if (done) return;
    done = true;
    out(ok ? "OK" : "FAIL " + why);
    app.exit(ok ? 0 : 1);
  };
  const timer = setTimeout(() => finish(false, "timeout 15s"), 15000);
  win.webContents.on("did-fail-load", (_e, code, desc, url, isMainFrame) => {
    if (isMainFrame && code !== -3) {
      clearTimeout(timer);
      finish(false, `${code} ${desc} ${url}`);
    }
  });
  win.webContents.on("did-finish-load", async () => {
    clearTimeout(timer);
    try {
      const ua = await win.webContents.executeJavaScript("navigator.userAgent");
      out("url " + win.webContents.getURL());
      out("ua " + ua);
      out("flavor " + FLAVOR.id + " userData " + app.getPath("userData"));
      finish(new RegExp("FomoDesktop/\\S+ " + OS_TOKEN).test(ua) && isTrustedUrl(win.webContents.getURL()), "no UA marker or wrong url");
    } catch (err) {
      finish(false, String(err));
    }
  });
  void win.loadURL(SITE);
}

// ---- start --------------------------------------------------------------------------------------------------------

if (SMOKE) {
  app.whenReady().then(() => {
    setupPermissions();
    runSmoke();
  });
} else if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
  app.whenReady().then(() => {
    // Windows: no menu bar (shortcuts are handled above). macOS needs an application menu for Cmd+C / V / Q to work at all.
    Menu.setApplicationMenu(MAC ? Menu.buildFromTemplate([{ role: "appMenu" }, { role: "editMenu" }, { role: "windowMenu" }]) : null);
    setupPermissions();
    createWindow();
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
  app.on("window-all-closed", () => app.quit());
}
