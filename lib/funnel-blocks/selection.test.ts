import { describe, expect, it } from "vitest";

import { DEFAULT_FUNNEL_BLOCKS } from "./catalog";
import { activeLegacyMetricKeysFromBlocks, normalizeFunnelBlockSelection } from "./selection";

describe("normalizeFunnelBlockSelection", () => {
  it("keeps multiple capture and conversion blocks while limiting nurturing to two", () => {
    const selection = normalizeFunnelBlockSelection({
      blocks: [
        { blockKey: "vsl", order: 1 },
        { blockKey: "lead_magnet", order: 2 },
        { blockKey: "sequence_email", order: 3 },
        { blockKey: "challenge", order: 4 },
        { blockKey: "webinaire", order: 5 },
        { blockKey: "appel", order: 6 },
        { blockKey: "checkout_direct", order: 7 },
      ],
      sources: ["organique"],
    }, DEFAULT_FUNNEL_BLOCKS);

    expect(selection.blocks.map((item) => item.blockKey)).toEqual([
      "vsl",
      "lead_magnet",
      "sequence_email",
      "challenge",
      "appel",
      "checkout_direct",
    ]);
    expect(selection.blocks.map((item) => item.order)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("does not allow an explicit empty mandatory zone", () => {
    const selection = normalizeFunnelBlockSelection({
      blocks: [{ blockKey: "sequence_email", order: 1 }],
      sources: ["ads"],
    }, DEFAULT_FUNNEL_BLOCKS);

    expect(selection.blocks.map((item) => item.blockKey)).toEqual([
      "lead_magnet",
      "sequence_email",
      "appel",
    ]);
  });

  it("does not activate lead-magnet metrics for a no-capture call journey", () => {
    const selection = normalizeFunnelBlockSelection({
      blocks: [
        { blockKey: "aucune_capture", order: 1 },
        { blockKey: "appel", order: 2 },
      ],
      sources: ["organique"],
    }, DEFAULT_FUNNEL_BLOCKS);

    expect(activeLegacyMetricKeysFromBlocks(selection, DEFAULT_FUNNEL_BLOCKS)).toEqual(["showUpRate", "closingRate"]);
  });
});
