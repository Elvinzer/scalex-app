import { describe, expect, it } from "vitest";

import { resolveBottleneckSourcePage } from "./bottleneck-source";

describe("bottleneck source page labels", () => {
  it.each([
    ["/acquisition/contenu", "clicks", { kind: "navigation", key: "content" }],
    ["/acquisition/mail", "newsletter:email_sends", { kind: "navigation", key: "mail" }],
    ["/acquisition/pipeline/funnel?range=current-month", "bookedCalls", { kind: "acquisitionPipeline" }],
    ["/crm/pipeline?view=stage", "leads", { kind: "navigation", key: "pipeline" }],
    ["/crm/appels", "attendedCalls", { kind: "navigation", key: "calls" }],
    ["/ventes/suivi", "salesClosed", { kind: "navigation", key: "salesTracking" }],
    ["/ventes/rdv", "calls_booked", { kind: "navigation", key: "appointments" }],
    ["/datas", "views", { kind: "navigation", key: "data" }],
    ["/business#acquisition", "views", { kind: "navigation", key: "business" }],
  ] as const)("maps %s to its visible source name", (href, stageId, expected) => {
    expect(resolveBottleneckSourcePage(href, stageId)).toEqual(expected);
  });

  it("uses the localized funnel-block label for a dynamic supported route", () => {
    expect(resolveBottleneckSourcePage("/acquisition/sequence-email", "sequence_email:email_sends")).toEqual({
      kind: "funnelBlock",
      key: "sequence_email",
    });
  });

  it("maps an acquisition journey to its localized catalog key", () => {
    expect(resolveBottleneckSourcePage("/acquisition/page-de-vente", "vente_directe:sales_page_visitors")).toEqual({
      kind: "acquisitionFunnel",
      key: "vente_directe",
    });
  });

  it("keeps unknown routes explicit instead of inventing a page name", () => {
    expect(resolveBottleneckSourcePage("https://example.com/source", "views")).toEqual({ kind: "unknown" });
  });
});
