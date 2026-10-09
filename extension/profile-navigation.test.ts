import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";

import { describe, expect, it } from "vitest";

const contentSource = readFileSync(new URL("./dist/content.js", import.meta.url), "utf8");
const mountCode = contentSource.lastIndexOf("\nminalyMount();");
if (mountCode < 0) throw new Error("The extension content script has no mount entry point.");

function shouldReconcileProfileNavigation(input: {
  urlChanged: boolean;
  awaitingProfile: boolean;
  previousConversationSurface: boolean;
  conversationSurface: boolean;
  previousProfileKey: string | null;
  profileKey: string | null;
  launcherMounted: boolean;
}): unknown {
  const context = createContext({ navigationInput: input });
  runInContext(contentSource.slice(0, mountCode), context);
  return runInContext("minalyShouldReconcileProfileNavigation(navigationInput)", context);
}

function shouldKeepWaitingForConversationIdentity(input: {
  awaitingProfile: boolean;
  profileKeyBeforeWait: string | null;
  profileKey: string | null;
  waitElapsedMs: number;
}): unknown {
  const context = createContext({ navigationInput: input });
  runInContext(contentSource.slice(0, mountCode), context);
  return runInContext("minalyShouldKeepWaitingForConversationIdentity(navigationInput)", context);
}

describe("CRM extension profile navigation", () => {
  it("reconciles when a conversation identity appears after the initial page load", () => {
    expect(shouldReconcileProfileNavigation({
      urlChanged: false,
      awaitingProfile: false,
      previousConversationSurface: false,
      conversationSurface: false,
      previousProfileKey: null,
      profileKey: "https://instagram.com/romano0092",
      launcherMounted: false,
    })).toBe(true);
  });

  it("restores the launcher when the host is removed from an otherwise unchanged profile", () => {
    expect(shouldReconcileProfileNavigation({
      urlChanged: false,
      awaitingProfile: false,
      previousConversationSurface: false,
      conversationSurface: false,
      previousProfileKey: "https://instagram.com/romano0092",
      profileKey: "https://instagram.com/romano0092",
      launcherMounted: false,
    })).toBe(true);
  });

  it("keeps an idle page with no profile or conversation quiet", () => {
    expect(shouldReconcileProfileNavigation({
      urlChanged: false,
      awaitingProfile: false,
      previousConversationSurface: false,
      conversationSurface: false,
      previousProfileKey: null,
      profileKey: null,
      launcherMounted: false,
    })).toBe(false);
  });

  it("does not reconcile an unchanged profile while its launcher is mounted", () => {
    expect(shouldReconcileProfileNavigation({
      urlChanged: false,
      awaitingProfile: false,
      previousConversationSurface: false,
      conversationSurface: false,
      previousProfileKey: "https://instagram.com/romano0092",
      profileKey: "https://instagram.com/romano0092",
      launcherMounted: true,
    })).toBe(false);
  });

  it("stops waiting when the same conversation identity appears after the fallback delay", () => {
    expect(shouldKeepWaitingForConversationIdentity({
      awaitingProfile: true,
      profileKeyBeforeWait: "https://instagram.com/romano0092",
      profileKey: "https://instagram.com/romano0092",
      waitElapsedMs: 2_000,
    })).toBe(false);
  });

  it("keeps waiting briefly while the previous identity remains visible", () => {
    expect(shouldKeepWaitingForConversationIdentity({
      awaitingProfile: true,
      profileKeyBeforeWait: "https://instagram.com/romano0092",
      profileKey: "https://instagram.com/romano0092",
      waitElapsedMs: 1_000,
    })).toBe(true);
  });
});
