"use strict";
// The two desktop apps built from this folder. Read by main.js (at run time) and by electron-builder.config.js (at build time).
//   main     FOMO           -> https://fomo.spot            FOMO-Setup.exe / FOMO.dmg
//   terminal FOMO Terminal  -> https://terminal.fomo.spot   FOMO-Terminal-Setup.exe / FOMO-Terminal.dmg
// The flavor is chosen at build time (FLAVOR=terminal, see README.md) and baked into the packaged package.json as `fomoFlavor`;
// `npm start` uses FOMO_FLAVOR / FLAVOR from the environment. Each flavor has its own appId, userData folder (sessions,
// cookies, window state) and single-instance lock, so the two apps never share a login and can run side by side.
module.exports = {
  main: {
    id: "main",
    productName: "FOMO",
    packageName: "fomo-desktop",
    description: "FOMO for Windows and macOS: a thin desktop shell around https://fomo.spot",
    site: "https://fomo.spot/",
    hosts: ["fomo.spot", "www.fomo.spot"],
    appId: "spot.fomo.desktop",
    userDataDir: "FOMO",
    icon: "assets/icon.png", // window icon at run time
    winIcon: "build/icon.ico",
    macIcon: "build/icon.png",
    winArtifact: "FOMO-Setup-${version}.${ext}",
    macArtifact: "FOMO-${version}-mac.${ext}",
    outputDir: "C:/Users/viptd/tools/desktop-out",
  },
  terminal: {
    id: "terminal",
    productName: "FOMO Terminal",
    packageName: "fomo-terminal-desktop",
    description: "FOMO Terminal for Windows and macOS: a thin desktop shell around https://terminal.fomo.spot",
    site: "https://terminal.fomo.spot/",
    hosts: ["terminal.fomo.spot"],
    appId: "spot.fomo.terminal.desktop",
    userDataDir: "FOMO Terminal",
    icon: "assets/icon-terminal.png",
    winIcon: "build/icon-terminal.ico",
    macIcon: "build/icon-terminal.png",
    winArtifact: "FOMO-Terminal-Setup-${version}.${ext}",
    macArtifact: "FOMO-Terminal-${version}-mac.${ext}",
    outputDir: "C:/Users/viptd/tools/desktop-out-terminal",
  },
};
