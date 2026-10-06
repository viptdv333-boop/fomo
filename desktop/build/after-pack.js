"use strict";
// Trims the Electron runtime to keep the installer under GitHub's 100 MB file limit (target: < 95 MB).
// - dxcompiler.dll / dxil.dll: WebGPU shader compilation only.
// - vk_swiftshader.dll / vk_swiftshader_icd.json / vulkan-1.dll: software Vulkan, used for WebGL on machines without a usable GPU.
// The site uses neither WebGPU nor WebGL (the charts are canvas 2D, which rasterises in software without them), and
// Chromium falls back silently when the files are missing. ANGLE/D3D11, ffmpeg and the licenses stay.
const fs = require("fs");
const path = require("path");

exports.default = async function afterPack(context) {
  for (const name of ["dxcompiler.dll", "dxil.dll", "vk_swiftshader.dll", "vk_swiftshader_icd.json", "vulkan-1.dll"]) {
    const file = path.join(context.appOutDir, name);
    try {
      fs.rmSync(file, { force: true });
    } catch (e) {
      console.warn("after-pack: cannot remove " + name + ": " + e.message);
    }
  }
};
