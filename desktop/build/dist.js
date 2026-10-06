"use strict";
// Wrapper for the npm scripts: `node build/dist.js <main|terminal> <--win nsis --x64 | --mac>` sets FLAVOR and runs electron-builder
// with electron-builder.config.js (no cross-env needed, works in PowerShell, cmd and bash).
const { spawnSync } = require("child_process");
const path = require("path");

const [flavor, ...rest] = process.argv.slice(2);
if (flavor !== "main" && flavor !== "terminal") {
  console.error("usage: node build/dist.js <main|terminal> <electron-builder platform args>");
  process.exit(2);
}
const cli = path.join(__dirname, "..", "node_modules", "electron-builder", "cli.js");
const r = spawnSync(process.execPath, [cli, "--config", "electron-builder.config.js", ...rest], {
  stdio: "inherit",
  cwd: path.join(__dirname, ".."),
  env: { ...process.env, FLAVOR: flavor },
});
process.exit(r.status === null ? 1 : r.status);
