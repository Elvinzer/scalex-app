import { describe, expect, it } from "vitest";

import {
  aggregateTrafficSources,
  averageHookRetention,
  dropOffSeconds,
  formatTimecode,
  hasUsableRetention,
  hookRetention,
  medianDropOffSeconds,
} from "./retention";

// A curve that holds 100% until `dropAt`, then collapses to 20%.
function curve(dropAt: number) {
  return Array.from({ length: 100 }, (_, i) => {
    const ratio = (i + 1) / 100;
    return { ratio, watchRatio: ratio < dropAt ? 1 : 0.2 };
  });
}

const video = (over: Partial<Parameters<typeof dropOffSeconds>[0]> = {}) => ({
  retentionCurve: curve(0.5),
  views: 1000,
  durationSeconds: 600,
  ...over,
});

describe("retention guardrails", () => {
  it("ignores videos below the view threshold instead of trusting a noisy curve", () => {
    expect(hasUsableRetention(video({ views: 99 }))).toBe(false);
    expect(dropOffSeconds(video({ views: 99 }))).toBeNull();
  });

  it("ignores videos with no curve at all rather than inventing one", () => {
    expect(hasUsableRetention(video({ retentionCurve: null }))).toBe(false);
  });

  it("returns null when the audience never drops below half, instead of a fake drop-off", () => {
    const solid = Array.from({ length: 100 }, (_, i) => ({ ratio: (i + 1) / 100, watchRatio: 0.9 }));
    expect(dropOffSeconds(video({ retentionCurve: solid }))).toBeNull();
  });
});

describe("retention figures", () => {
  it("converts the drop-off point into real seconds of the video", () => {
    // Collapses at 50% of a 600s video -> 300s -> 5:00
    expect(dropOffSeconds(video())).toBe(300);
    expect(formatTimecode(300)).toBe("5:00");
  });

  it("reads the hook at the 30-second mark", () => {
    expect(hookRetention(video())).toBe(1); // still 100% at 30s of a 600s video
  });

  it("has no hook figure for a video shorter than the hook window", () => {
    expect(hookRetention(video({ durationSeconds: 25 }))).toBeNull();
  });

  it("uses the median so one early-drop video can't skew the channel figure", () => {
    const videos = [
      video({ retentionCurve: curve(0.1) }), // 60s
      video({ retentionCurve: curve(0.5) }), // 300s
      video({ retentionCurve: curve(0.6) }), // 360s
    ];
    expect(medianDropOffSeconds(videos)).toBe(300);
  });

  it("averages the hook only over videos that have one", () => {
    expect(averageHookRetention([video(), video({ durationSeconds: 25 })])).toBe(1);
    expect(averageHookRetention([video({ views: 1 })])).toBeNull();
  });
});

describe("traffic sources", () => {
  it("sums across videos, labels in French and ranks by volume", () => {
    const result = aggregateTrafficSources([
      { trafficSources: [{ source: "YT_SEARCH", views: 100 }, { source: "BROWSE", views: 50 }] },
      { trafficSources: [{ source: "YT_SEARCH", views: 50 }] },
    ]);
    expect(result[0]).toMatchObject({ source: "YT_SEARCH", label: "Recherche YouTube", views: 150 });
    expect(result[0].share).toBeCloseTo(0.75);
    expect(result[1].label).toBe("Page d'accueil / Explorer");
  });

  it("returns nothing when no video has traffic data, so the block stays hidden", () => {
    expect(aggregateTrafficSources([{ trafficSources: null }])).toEqual([]);
  });
});

describe("re-watched segments (audienceWatchRatio > 1)", () => {
  it("clamps the hook figure at 100% — a looped Short reports >1, but 110% of an audience cannot be watching", () => {
    const looping = Array.from({ length: 100 }, (_, i) => ({ ratio: (i + 1) / 100, watchRatio: 1.4 }));
    expect(hookRetention({ retentionCurve: looping, views: 1000, durationSeconds: 600 })).toBe(1);
  });

  it("keeps the channel average within 0-1 too", () => {
    const looping = Array.from({ length: 100 }, (_, i) => ({ ratio: (i + 1) / 100, watchRatio: 2 }));
    expect(averageHookRetention([{ retentionCurve: looping, views: 1000, durationSeconds: 600 }])).toBe(1);
  });
});
