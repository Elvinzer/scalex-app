import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const stylesheet = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
const rootBlock = readThemeBlock(":root");

function readThemeBlock(selector: string): Record<string, string> {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = stylesheet.match(new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\n\\}`));
  if (!match) throw new Error(`Missing theme block: ${selector}`);

  return Object.fromEntries(
    [...match[1].matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()]),
  );
}

function resolveVariables(value: string, variables: Record<string, string>): string {
  return value.replace(/var\(--([\w-]+)\)/g, (_, name: string) => {
    const resolved = variables[name] ?? rootBlock[name];
    if (!resolved) throw new Error(`Missing CSS token: --${name}`);
    return resolved;
  });
}

function linearChannel(value: number): number {
  const normalized = value / 255;
  return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const channels = hex.slice(1).match(/.{2}/g)?.map((channel) => Number.parseInt(channel, 16));
  if (!channels || channels.length !== 3) throw new Error(`Invalid RGB token: ${hex}`);
  return 0.2126 * linearChannel(channels[0]) + 0.7152 * linearChannel(channels[1]) + 0.0722 * linearChannel(channels[2]);
}

function contrastRatio(first: string, second: string): number {
  const [lighter, darker] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

function interpolate(first: string, second: string, progress: number): string {
  const firstChannels = first.slice(1).match(/.{2}/g)?.map((channel) => Number.parseInt(channel, 16));
  const secondChannels = second.slice(1).match(/.{2}/g)?.map((channel) => Number.parseInt(channel, 16));
  if (!firstChannels || !secondChannels) throw new Error("Invalid gradient stop.");
  const channels = firstChannels.map((channel, index) => Math.round(channel + (secondChannels[index] - channel) * progress));
  return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

function minimumGradientContrast(foreground: string, gradient: string): number {
  const stops = gradient.match(/#[\da-f]{6}/gi) ?? [];
  if (stops.length < 2) throw new Error("Expected at least two explicit gradient stops.");

  let minimum = Number.POSITIVE_INFINITY;
  for (let index = 0; index < stops.length - 1; index += 1) {
    for (let sample = 0; sample <= 100; sample += 1) {
      minimum = Math.min(minimum, contrastRatio(foreground, interpolate(stops[index], stops[index + 1], sample / 100)));
    }
  }
  return minimum;
}

describe("CTA gradient contrast", () => {
  it.each([
    ["light", rootBlock],
    ["dark", readThemeBlock(".dark")],
  ])("keeps both CTA gradients above WCAG AA contrast in %s mode", (_mode, theme) => {
    const foreground = theme["text-on-accent-fill"] ?? rootBlock["text-on-accent-fill"];
    expect(foreground).toMatch(/^#[\da-f]{6}$/i);

    for (const token of ["gradient-accent", "gradient-accent-2"]) {
      const gradient = resolveVariables(theme[token], theme);
      expect(minimumGradientContrast(foreground, gradient), `${_mode} --${token}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});
