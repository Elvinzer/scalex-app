import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deflateRawSync } from "node:zlib";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const extensionDir = path.join(rootDir, "extension");
const downloadsDir = path.join(rootDir, "public", "downloads");
const manifestPath = path.join(extensionDir, "manifest.json");
const runtimeFiles = [
  "manifest.json",
  "auth-callback.html",
  "dist/background.js",
  "dist/content.js",
  "dist/auth-callback.js",
];
const chromeVersionPattern = /^(?:\d{1,4})(?:\.\d{1,4}){0,3}$/;

function compareVersions(left, right) {
  const leftParts = left.split(".").map(Number);
  const rightParts = right.split(".").map(Number);
  const segmentCount = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < segmentCount; index += 1) {
    const leftSegment = leftParts[index] ?? 0;
    const rightSegment = rightParts[index] ?? 0;
    if (leftSegment < rightSegment) return -1;
    if (leftSegment > rightSegment) return 1;
  }
  return 0;
}

function assertManifest(manifest) {
  if (!manifest || manifest.manifest_version !== 3 || typeof manifest.version !== "string" || !chromeVersionPattern.test(manifest.version)) {
    throw new Error("The extension manifest must use Manifest V3 and a valid Chrome version.");
  }
  if (manifest.background?.service_worker !== "dist/background.js") {
    throw new Error("The extension background entry point is not the expected compiled file.");
  }
  if (!manifest.content_scripts?.some((entry) => entry.js?.includes("dist/content.js"))) {
    throw new Error("The extension content entry point is not the expected compiled file.");
  }
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zipEntry(name, data, offset) {
  const nameBuffer = Buffer.from(name, "utf8");
  const compressed = deflateRawSync(data, { level: 9 });
  const checksum = crc32(data);
  const localHeader = Buffer.alloc(30 + nameBuffer.length);
  localHeader.writeUInt32LE(0x04034b50, 0);
  localHeader.writeUInt16LE(20, 4);
  localHeader.writeUInt16LE(0x0800, 6);
  localHeader.writeUInt16LE(8, 8);
  localHeader.writeUInt16LE(0, 10);
  localHeader.writeUInt16LE(0, 12);
  localHeader.writeUInt32LE(checksum, 14);
  localHeader.writeUInt32LE(compressed.length, 18);
  localHeader.writeUInt32LE(data.length, 22);
  localHeader.writeUInt16LE(nameBuffer.length, 26);
  localHeader.writeUInt16LE(0, 28);
  nameBuffer.copy(localHeader, 30);

  const centralHeader = Buffer.alloc(46 + nameBuffer.length);
  centralHeader.writeUInt32LE(0x02014b50, 0);
  centralHeader.writeUInt16LE(20, 4);
  centralHeader.writeUInt16LE(20, 6);
  centralHeader.writeUInt16LE(0x0800, 8);
  centralHeader.writeUInt16LE(8, 10);
  centralHeader.writeUInt16LE(0, 12);
  centralHeader.writeUInt16LE(0, 14);
  centralHeader.writeUInt32LE(checksum, 16);
  centralHeader.writeUInt32LE(compressed.length, 20);
  centralHeader.writeUInt32LE(data.length, 24);
  centralHeader.writeUInt16LE(nameBuffer.length, 28);
  centralHeader.writeUInt16LE(0, 30);
  centralHeader.writeUInt16LE(0, 32);
  centralHeader.writeUInt16LE(0, 34);
  centralHeader.writeUInt16LE(0, 36);
  centralHeader.writeUInt32LE(0, 38);
  centralHeader.writeUInt32LE(offset, 42);
  nameBuffer.copy(centralHeader, 46);

  return { localHeader, compressed, centralHeader };
}

function createZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const entry of entries) {
    const zipped = zipEntry(entry.name, entry.data, offset);
    localParts.push(zipped.localHeader, zipped.compressed);
    centralParts.push(zipped.centralHeader);
    offset += zipped.localHeader.length + zipped.compressed.length;
  }
  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

async function main() {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  assertManifest(manifest);
  const previousVersion = process.env.CRM_EXTENSION_PREVIOUS_VERSION?.trim();
  if (previousVersion) {
    if (!chromeVersionPattern.test(previousVersion)) throw new Error("CRM_EXTENSION_PREVIOUS_VERSION is not a valid Chrome version.");
    if (compareVersions(manifest.version, previousVersion) <= 0) {
      throw new Error(`Extension version ${manifest.version} must be greater than previous release ${previousVersion}.`);
    }
  }

  const entries = await Promise.all(runtimeFiles.map(async (name) => ({ name, data: await readFile(path.join(extensionDir, name)) })));
  const archive = createZip(entries);
  await mkdir(downloadsDir, { recursive: true });
  const versionedName = `minaly-crm-v${manifest.version}.zip`;
  await writeFile(path.join(downloadsDir, versionedName), archive);
  await writeFile(path.join(downloadsDir, "minaly-crm-latest.zip"), archive);
  await writeFile(
    path.join(downloadsDir, "minaly-crm-latest.json"),
    `${JSON.stringify({ name: manifest.name, version: manifest.version, package: `/downloads/${versionedName}`, latest: "/downloads/minaly-crm-latest.zip", files: runtimeFiles }, null, 2)}\n`,
  );
  process.stdout.write(`Packaged Minaly CRM ${manifest.version} (${runtimeFiles.length} files)\n`);
}

await main();
