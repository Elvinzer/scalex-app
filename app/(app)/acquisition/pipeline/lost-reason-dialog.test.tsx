import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import enPipelineMessages from "@/locales/en/pipeline.json";
import frPipelineMessages from "@/locales/fr/pipeline.json";

vi.mock("./lead-actions", () => ({
  changeStageAction: vi.fn(),
}));

vi.mock("@/components/ui/dialog", () => {
  const Shell = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return { Dialog: Shell, DialogContent: Shell, DialogTitle: Shell };
});

import { LostReasonDialog } from "./lost-reason-dialog";

describe("legacy loss reason dialog", () => {
  it.each([
    ["fr", frPipelineMessages, "Non intéressé"],
    ["en", enPipelineMessages, "Not interested"],
  ] as const)("renders the new reason in %s", (locale, messages, label) => {
    const html = renderToStaticMarkup(
      <NextIntlClientProvider locale={locale} timeZone="UTC" messages={{ pipeline: messages }}>
        <LostReasonDialog leadId="00000000-0000-4000-8000-000000000001" open onOpenChange={vi.fn()} />
      </NextIntlClientProvider>,
    );

    expect(html).toContain(label);
    expect(html).not.toContain("lostReason.non_interesse");
    expect((html.match(/aria-pressed/g) ?? [])).toHaveLength(6);
  });
});
