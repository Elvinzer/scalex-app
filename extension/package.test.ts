import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function zipNames(archive: Buffer): string[] {
  const endSignature = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
  const endOffset = archive.lastIndexOf(endSignature);
  if (endOffset < 0) throw new Error("ZIP end record not found");
  const count = archive.readUInt16LE(endOffset + 8);
  let offset = archive.readUInt32LE(endOffset + 16);
  const names: string[] = [];
  for (let index = 0; index < count; index += 1) {
    if (archive.readUInt32LE(offset) !== 0x02014b50) throw new Error("ZIP central directory is invalid");
    const nameLength = archive.readUInt16LE(offset + 28);
    const extraLength = archive.readUInt16LE(offset + 30);
    const commentLength = archive.readUInt16LE(offset + 32);
    names.push(archive.toString("utf8", offset + 46, offset + 46 + nameLength));
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return names;
}

describe("CRM extension package", () => {
  it("contains only the runtime allowlist and writes versioned/latest archives", () => {
    execFileSync(process.execPath, ["scripts/package-extension.mjs"], {
      cwd: rootDir,
      env: { ...process.env, CRM_EXTENSION_PREVIOUS_VERSION: "" },
      stdio: "pipe",
    });
    const versioned = readFileSync(path.join(rootDir, "public", "downloads", "minaly-crm-v0.2.0.zip"));
    const latest = readFileSync(path.join(rootDir, "public", "downloads", "minaly-crm-latest.zip"));
    const expected = ["manifest.json", "auth-callback.html", "dist/background.js", "dist/content.js", "dist/auth-callback.js"];
    expect(zipNames(versioned)).toEqual(expected);
    expect(zipNames(latest)).toEqual(expected);
    expect(latest.equals(versioned)).toBe(true);
  });

  it("rejects a package version that is not greater than the published version", () => {
    expect(() => execFileSync(process.execPath, ["scripts/package-extension.mjs"], {
      cwd: rootDir,
      env: { ...process.env, CRM_EXTENSION_PREVIOUS_VERSION: "0.2.0" },
      stdio: "pipe",
    })).toThrow(/must be greater than previous release/);
  });
});
