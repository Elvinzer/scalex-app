// One-off asset prep for the Falco mascot. Sources in assets/falco/v2/ are
// raw ChatGPT exports on a flat checkerboard-pattern background (RGB, no
// alpha — the checker is baked into the pixels, not real transparency).
// This script: (1) removes that background via a border-seeded flood fill
// tolerant of the checker's two near-white shades, (2) trims the huge
// transparent margins around each character down to its own bounding box
// (with a little padding) so the file's aspect ratio matches the character
// instead of mostly empty canvas, and (3) derives a tight head/shoulders
// "bust" crop from the assistant pose for the small chat-widget icon.
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const srcPath = (name) => fileURLToPath(new URL(`../assets/falco/v2/${name}`, import.meta.url));
const outPath = (name) => fileURLToPath(new URL(`../assets/falco/${name}`, import.meta.url));

async function removeCheckerBackground(inputPath) {
  const { data, info } = await sharp(inputPath).raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const size = width * height;
  const alpha = new Uint8Array(size).fill(255);
  const visited = new Uint8Array(size);

  const colorAt = (idx) => {
    const o = idx * channels;
    return [data[o], data[o + 1], data[o + 2]];
  };
  const isBackgroundColor = ([r, g, b]) => {
    const maxc = Math.max(r, g, b), minc = Math.min(r, g, b);
    return minc > 195 && maxc - minc < 20;
  };

  // BFS flood fill seeded from every border pixel, chained by similarity to
  // the neighbor already accepted as background — this follows the checker's
  // two close shades without leaking into the character (whose darkest
  // blacks and warm cream/orange tones are nowhere near that range).
  const queue = [];
  for (let x = 0; x < width; x++) {
    queue.push(x);
    queue.push((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    queue.push(y * width);
    queue.push(y * width + (width - 1));
  }

  let qi = 0;
  while (qi < queue.length) {
    const idx = queue[qi++];
    if (visited[idx]) continue;
    const c = colorAt(idx);
    if (!isBackgroundColor(c)) continue;
    visited[idx] = 1;
    alpha[idx] = 0;
    const x = idx % width, y = Math.floor(idx / width);
    const neighbors = [];
    if (x > 0) neighbors.push(idx - 1);
    if (x < width - 1) neighbors.push(idx + 1);
    if (y > 0) neighbors.push(idx - width);
    if (y < height - 1) neighbors.push(idx + width);
    for (const n of neighbors) {
      if (visited[n]) continue;
      const nc = colorAt(n);
      const dist = Math.abs(nc[0] - c[0]) + Math.abs(nc[1] - c[1]) + Math.abs(nc[2] - c[2]);
      if (dist <= 24 && isBackgroundColor(nc)) queue.push(n);
    }
  }

  // Soften the hard flood-fill edge with a small box blur on the alpha
  // channel only (sharp's joinChannel silently drops it — plain JS instead).
  const blurred = new Uint8Array(size);
  const r = 2;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0, count = 0;
      for (let dy = -r; dy <= r; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -r; dx <= r; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          sum += alpha[ny * width + nx];
          count++;
        }
      }
      blurred[y * width + x] = Math.round(sum / count);
    }
  }

  const out = Buffer.alloc(size * 4);
  for (let i = 0; i < size; i++) {
    const o = i * channels, oo = i * 4;
    out[oo] = data[o];
    out[oo + 1] = data[o + 1];
    out[oo + 2] = data[o + 2];
    out[oo + 3] = blurred[i];
  }

  return { buffer: out, width, height };
}

function boundingBox({ buffer, width, height }, alphaThreshold = 10) {
  let minX = width, minY = height, maxX = 0, maxY = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = buffer[(y * width + x) * 4 + 3];
      if (a > alphaThreshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

const SOURCES = {
  hero: "ChatGPT_Image_21_juil._2026_18_32_41_1.png",
  dashboard: "ChatGPT_Image_21_juil._2026_18_32_41_2.png",
  assistant: "ChatGPT_Image_21_juil._2026_18_33_07.png",
  flying: "ChatGPT_Image_21_juil._2026_18_33_11.png",
  insights: "ChatGPT_Image_21_juil._2026_18_33_25.png",
};

await mkdir(outPath("."), { recursive: true });

let assistantTrimmed = null;

for (const [name, file] of Object.entries(SOURCES)) {
  const result = await removeCheckerBackground(srcPath(file));
  const box = boundingBox(result);
  const pad = 12;
  const left = Math.max(0, box.left - pad);
  const top = Math.max(0, box.top - pad);
  const width = Math.min(result.width - left, box.width + pad * 2);
  const height = Math.min(result.height - top, box.height + pad * 2);

  const trimmed = sharp(result.buffer, { raw: { width: result.width, height: result.height, channels: 4 } }).extract({
    left,
    top,
    width,
    height,
  });
  await trimmed.clone().png({ compressionLevel: 9 }).toFile(outPath(`falco-${name}.png`));

  if (name === "assistant") assistantTrimmed = { img: trimmed, width, height };
}

// "bust" — tight head/shoulders square from the top of the assistant pose,
// for the collapsed chat-widget icon and other small-avatar contexts.
const bustSide = assistantTrimmed.width;
await assistantTrimmed.img
  .clone()
  .extract({ left: 0, top: 0, width: bustSide, height: Math.min(bustSide, assistantTrimmed.height) })
  .png({ compressionLevel: 9 })
  .toFile(outPath("falco-bust.png"));

console.log("Falco v2 assets written to assets/falco/");
