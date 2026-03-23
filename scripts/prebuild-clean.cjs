const fs = require("fs");
const path = require("path");

const outDir = path.join(__dirname, "..", "_site");

try {
  fs.rmSync(outDir, { recursive: true, force: true });
  console.log(`[prebuild] Cleaned output directory: ${outDir}`);
} catch (err) {
  console.warn(`[prebuild] Failed to clean output directory: ${err.message}`);
}
