// One-off asset prep for the per-page Falco skins (lib/falco-skins.ts).
// Run manually via `node scripts/prepare-falco-skins.mjs` against the raw
// renders in ~/Downloads/Falco/ (not committed, not part of the build) —
// writes the compressed, uniformly-cropped output straight into
// public/falco/skins/. Never runs at build time.
//
// Two passes per source image:
// 1. Full-body "skin": trims transparent margins (via a manual alpha scan —
//    sharp's own .trim() didn't detect these particular PNGs' alpha edges),
//    resizes to a fixed height fraction of a 512 canvas, composites
//    bottom-anchored + horizontally centered — this is what makes the 6
//    characters look like they're standing at the same height/ground line
//    across pages, without hand-tuning each one.
// 2. "Portrait": a head/shoulders square crop for the small chat-bubble
//    circle. PORTRAIT_HEAD_FRACTION/PORTRAIT_Y_OFFSET below are the tunable
//    knobs — after running this script, the resulting PNGs were inspected
//    visually and these values adjusted per-image until eye level lined up
//    across all 6 (see the per-file overrides below).
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const SOURCE_DIR = path.join(process.env.HOME, "Downloads/Falco");
const OUT_DIR = "public/falco/skins";
const PORTRAIT_OUT_DIR = path.join(OUT_DIR, "portraits");

const SKINS = [
  { file: "Mail.png", key: "mail" },
  { file: "ventes.png", key: "vente" },
  { file: "contenu.png", key: "contenu" },
  { file: "ads.png", key: "acquisition" },
  { file: "diagnostique.png", key: "diagnostic" },
  { file: "mes chiffres.png", key: "chiffres" },
];

const CANVAS_SIZE = 512;
const CHAR_HEIGHT_FRACTION = 0.9; // character height as a fraction of the canvas
const BOTTOM_MARGIN_PX = 14;
const BBOX_ALPHA_THRESHOLD = 10;
const BBOX_PADDING_FRACTION = 0.015; // small breathing room around the trimmed content

const PORTRAIT_SIZE = 256;
// Default head-crop shape; per-image overrides below tune eye-level
// alignment (checked by rendering + visually inspecting the 6 portraits).
const DEFAULT_PORTRAIT_HEAD_FRACTION = 0.42; // crop height, as a fraction of the full bbox height
const PORTRAIT_OVERRIDES = {
  mail: { headFraction: 0.42, yOffsetFraction: 0 },
  vente: { headFraction: 0.42, yOffsetFraction: 0 },
  contenu: { headFraction: 0.42, yOffsetFraction: 0 },
  acquisition: { headFraction: 0.42, yOffsetFraction: 0 },
  diagnostic: { headFraction: 0.42, yOffsetFraction: 0 },
  chiffres: { headFraction: 0.42, yOffsetFraction: 0 },
};

async function computeAlphaBoundingBox(image) {
  const { data, info } = await image.clone().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  let minX = width;
  let maxX = 0;
  let minY = height;
  let maxY = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = data[(y * width + x) * channels + 3];
      if (alpha > BBOX_ALPHA_THRESHOLD) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return { width, height, minX, maxX, minY, maxY };
}

async function writeVariant(pipeline, outPathNoExt) {
  await pipeline.clone().webp({ quality: 82 }).toFile(`${outPathNoExt}.webp`);
  await pipeline.clone().png({ compressionLevel: 9 }).toFile(`${outPathNoExt}.png`);
}

async function buildSkin(sourcePath, key) {
  const source = sharp(sourcePath);
  const box = await computeAlphaBoundingBox(source);
  const padX = Math.round((box.maxX - box.minX) * BBOX_PADDING_FRACTION);
  const padY = Math.round((box.maxY - box.minY) * BBOX_PADDING_FRACTION);
  const cropLeft = Math.max(0, box.minX - padX);
  const cropTop = Math.max(0, box.minY - padY);
  const cropWidth = Math.min(box.width - cropLeft, box.maxX - box.minX + 2 * padX);
  const cropHeight = Math.min(box.height - cropTop, box.maxY - box.minY + 2 * padY);

  const trimmed = source.clone().extract({ left: cropLeft, top: cropTop, width: cropWidth, height: cropHeight });

  for (const scale of [1, 2]) {
    const canvasSize = CANVAS_SIZE * scale;
    const targetHeight = Math.round(canvasSize * CHAR_HEIGHT_FRACTION);
    const bottomMargin = BOTTOM_MARGIN_PX * scale;

    const resizedBuffer = await trimmed.clone().resize({ height: targetHeight, fit: "inside" }).toBuffer({ resolveWithObject: true });
    const { width: resizedWidth, height: resizedHeight } = resizedBuffer.info;
    const left = Math.round((canvasSize - resizedWidth) / 2);
    const top = canvasSize - bottomMargin - resizedHeight;

    const canvas = sharp({
      create: { width: canvasSize, height: canvasSize, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    }).composite([{ input: resizedBuffer.data, left, top }]);

    const suffix = scale === 2 ? "@2x" : "";
    await writeVariant(canvas, path.join(OUT_DIR, `falco-skin-${key}${suffix}`));
  }

  return box;
}

async function buildPortrait(sourcePath, key, box) {
  const override = PORTRAIT_OVERRIDES[key] ?? { headFraction: DEFAULT_PORTRAIT_HEAD_FRACTION, yOffsetFraction: 0 };
  const boxHeight = box.maxY - box.minY;
  const boxCenterX = (box.minX + box.maxX) / 2;
  const cropSize = Math.round(boxHeight * override.headFraction);
  const cropTop = Math.max(0, Math.round(box.minY + boxHeight * override.yOffsetFraction));
  const cropLeft = Math.max(0, Math.min(box.width - cropSize, Math.round(boxCenterX - cropSize / 2)));

  const source = sharp(sourcePath);

  for (const scale of [1, 2]) {
    const size = PORTRAIT_SIZE * scale;
    const pipeline = source
      .clone()
      .extract({ left: cropLeft, top: cropTop, width: Math.min(cropSize, box.width - cropLeft), height: Math.min(cropSize, box.height - cropTop) })
      .resize({ width: size, height: size, fit: "cover" });

    const suffix = scale === 2 ? "@2x" : "";
    await writeVariant(pipeline, path.join(PORTRAIT_OUT_DIR, `falco-portrait-${key}${suffix}`));
  }
}

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(PORTRAIT_OUT_DIR, { recursive: true });

for (const { file, key } of SKINS) {
  const sourcePath = path.join(SOURCE_DIR, file);
  const box = await buildSkin(sourcePath, key);
  await buildPortrait(sourcePath, key, box);
  console.log(`✓ ${key} (from ${file})`);
}

console.log("Done. Inspect public/falco/skins/ and public/falco/skins/portraits/ before committing.");
