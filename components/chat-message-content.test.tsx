import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ChatMessageContent, normalizeChatMath } from "./chat-message-content";

describe("ChatMessageContent", () => {
  it("turns Falco's display math into readable content", () => {
    const markup = renderToStaticMarkup(
      <ChatMessageContent
        text={"The conversion is:\n\n\\[\n\\frac{1\\text{ sale}}{293\\text{ new followers}}\n\\approx 0.34\\%\n\\]"}
      />,
    );

    expect(markup).toContain('data-chat-math="block"');
    expect(markup).toContain("1 sale / 293 new followers ≈ 0.34%");
    expect(markup).not.toContain("\\frac");
    expect(markup).not.toContain("\\[");
  });

  it("keeps bold text and renders ordered and unordered lists", () => {
    const markup = renderToStaticMarkup(
      <ChatMessageContent text={"**Why it matters**\n1. First step\n2. Second step\n- One check\n- Another check"} />,
    );

    expect(markup).toContain("<strong");
    expect(markup).toContain("<ol");
    expect(markup).toContain("<ul");
  });

  it("normalizes the common inline LaTeX commands without exposing syntax", () => {
    expect(normalizeChatMath("\\text{new followers} \\times 2 \\approx 4\\%"))
      .toBe("new followers × 2 ≈ 4%");
  });
});
