import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";

import { describe, expect, it } from "vitest";

const contentSource = readFileSync(new URL("./dist/content.js", import.meta.url), "utf8");
const mountCode = contentSource.lastIndexOf("\nminalyMount();");
if (mountCode < 0) throw new Error("The extension content script has no mount entry point.");

function evaluateContentExpression(expression: string, globals: Record<string, unknown> = {}): unknown {
  const context = createContext(globals);
  runInContext(contentSource.slice(0, mountCode), context);
  return runInContext(expression, context);
}

function readLeadWithFallbackAssignment(): unknown {
  return evaluateContentExpression("minalyReadLead(testLead, fallbackAssignment)", {
    testLead: {
      id: "lead-1",
      displayName: "Claire Martin",
      stage: "first_message_sent",
      outcome: "none",
      contactState: "new",
    },
    fallbackAssignment: {
      id: "assignment-1",
      testId: "test-1",
      channel: "instagram",
      variant: "B",
      messageSnapshot: "Bonjour Claire, j’ai une question pour toi.",
      status: "active",
      assignedAt: "2026-10-06T10:00:00.000Z",
      copiedAt: null,
      sentAt: null,
    },
  });
}

describe("CRM extension A/B message assignment", () => {
  it("keeps the top-level assignment returned by capture when it is absent from the lead object", () => {
    expect(readLeadWithFallbackAssignment()).toMatchObject({
      id: "lead-1",
      messageTestAssignment: {
        id: "assignment-1",
        variant: "B",
        messageSnapshot: "Bonjour Claire, j’ai une question pour toi.",
        status: "active",
      },
    });
  });

  it("waits for the active conversation identity when navigation changes before its DOM", () => {
    expect(evaluateContentExpression(`minalyShouldWaitForConversationIdentity({
      urlChanged: true,
      previousConversationSurface: true,
      conversationSurface: true,
      previousProfileKey: "https://instagram.com/old-contact",
      profileKey: "https://instagram.com/old-contact",
    })`)).toBe(true);
    expect(evaluateContentExpression(`minalyShouldWaitForConversationIdentity({
      urlChanged: true,
      previousConversationSurface: true,
      conversationSurface: true,
      previousProfileKey: "https://instagram.com/old-contact",
      profileKey: "https://instagram.com/new-contact",
    })`)).toBe(false);
  });
});
