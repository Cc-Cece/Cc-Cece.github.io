const fs = require("fs");
const path = require("path");
const CleanCSS = require("clean-css");

function mergeCssParts(siteDir) {
  const partsDir = path.join(siteDir, "styles", "parts");
  const mainPath = path.join(siteDir, "styles", "main.css");
  if (!fs.existsSync(partsDir) || !fs.existsSync(mainPath)) return;

  const parts = fs.readdirSync(partsDir)
    .filter((name) => name.endsWith(".css"))
    .sort()
    .map((name) => fs.readFileSync(path.join(partsDir, name), "utf8"));

  if (!parts.length) return;
  const base = fs.readFileSync(mainPath, "utf8").replace(/@import\s+["']\.\/parts\/[^"']+["'];?\s*/g, "");
  fs.writeFileSync(mainPath, parts.join("\n") + "\n" + base, "utf8");
}

function tryMinifyCss(cssPath) {
  if (!fs.existsSync(cssPath)) return;
  const input = fs.readFileSync(cssPath, "utf8");
  const output = new CleanCSS({ level: 2 }).minify(input);
  if (output.errors && output.errors.length) {
    throw new Error(output.errors.join("\n"));
  }
  fs.writeFileSync(cssPath, output.styles, "utf8");
}

const siteDir = path.join(__dirname, "..", "_site");
mergeCssParts(siteDir);
tryMinifyCss(path.join(siteDir, "styles", "main.css"));

