"use strict";
// electron-builder configuration for both apps. Pick the flavor with FLAVOR (default main):
//   FLAVOR=terminal  ->  FOMO Terminal (terminal.fomo.spot)
// Use `npm run dist`, `dist:terminal`, `dist:mac`, `dist:mac:terminal` (build/dist.js sets FLAVOR and calls electron-builder).
// DESKTOP_OUT overrides the output folder (the Windows default is outside the repository, see README.md).
const flavors = require("./flavors");

const id = process.env.FLAVOR || "main";
const f = flavors[id];
if (!f) throw new Error(`unknown FLAVOR "${id}" (use: ${Object.keys(flavors).join(", ")})`);

const output = process.env.DESKTOP_OUT || (process.platform === "win32" ? f.outputDir : "dist/" + f.id);

module.exports = {
  appId: f.appId,
  productName: f.productName,
  copyright: "Copyright (c) Neurotrader 2026",
  asar: true,
  afterPack: "build/after-pack.js",
  compression: "maximum",
  electronLanguages: ["ru", "en-US", "zh-CN"],
  // the packaged package.json carries the flavor: name (the userData folder of dev runs), description and `fomoFlavor` for main.js
  extraMetadata: { name: f.packageName, productName: f.productName, description: f.description, fomoFlavor: f.id },
  directories: { output, buildResources: "build" },
  files: ["main.js", "flavors.js", "offline.html", f.icon, "package.json"],
  win: {
    target: [{ target: "nsis", arch: ["x64"] }],
    icon: f.winIcon,
    artifactName: f.winArtifact,
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    perMachine: false,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: f.productName,
    installerIcon: f.winIcon,
    uninstallerIcon: f.winIcon,
    installerHeaderIcon: f.winIcon,
    artifactName: f.winArtifact,
  },
  // macOS (built on a Mac or by .github/workflows/desktop-mac.yml): one universal (arm64 + x64) .dmg and .zip, only ad-hoc
  // signed, NOT notarized (no Apple Developer account): Gatekeeper asks to confirm the first launch (see README.md).
  mac: {
    target: [
      { target: "dmg", arch: ["universal"] },
      { target: "zip", arch: ["universal"] },
    ],
    icon: f.macIcon,
    category: "public.app-category.finance",
    identity: "-", // ad-hoc signature: Apple Silicon refuses to start a Mac app with no signature at all; not a Developer ID
    hardenedRuntime: false,
    gatekeeperAssess: false,
    artifactName: f.macArtifact,
  },
  dmg: {
    title: f.productName,
    format: "UDBZ", // bzip2: smaller than the default UDZO (electron-builder offers no LZMA)
    sign: false,
    artifactName: f.macArtifact,
  },
};
