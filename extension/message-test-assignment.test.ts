import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";

import { describe, expect, it } from "vitest";

const contentSource = readFileSync(new URL("./dist/content.js", import.meta.url), "utf8");

function readLeadWithFallbackAssignment(): unknown {
  const mountCode = contentSource.lastIndexOf("\nminalyMount();");
  if (mountCode < 0) throw new Error("The extension content script has no mount entry point.");
  const context = createContext({
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
      sentAt: null,
    },
  });
  runInContext(contentSource.slice(0, mountCode), context);
  return runInContext("minalyReadLead(testLead, fallbackAssignment)", context);
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
});
