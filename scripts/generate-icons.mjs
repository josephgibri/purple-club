// One-off: rasterize the PBTC glyph (embedded as base64 PNG inside the SVG)
// into the PNG icons the web app manifest + apple-touch-icon require.
//   node scripts/generate-icons.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import sharp from "sharp";

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = join(here, "..", "public");

const svg = readFileSync(join(publicDir, "purple-club-icon.svg"), "utf8");
const match = svg.match(/data:image\/png;base64,([A-Za-z0-9+/=]+)/);
if (!match) {
  throw new Error("Could not find embedded base64 PNG in purple-club-icon.svg");
}
const source = Buffer.from(match[1], "base64");

const targets = [
  { file: "purple-club-icon.png", size: 512 },
  { file: "purple-club-icon-192.png", size: 192 },
  { file: "apple-touch-icon.png", size: 180 },
];

for (const { file, size } of targets) {
  await sharp(source)
    .resize(size, size, { fit: "cover" })
    .png()
    .toFile(join(publicDir, file));
  console.log(`wrote public/${file} (${size}x${size})`);
}
