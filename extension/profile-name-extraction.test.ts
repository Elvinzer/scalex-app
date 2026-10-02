import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";

import { describe, expect, it } from "vitest";

type FixtureRect = { left: number; right: number; top: number; bottom: number; width: number; height: number };
type FixtureNode = {
  textContent: string;
  isConnected: boolean;
  rect: FixtureRect;
  getBoundingClientRect(): FixtureRect;
};

const contentSource = readFileSync(new URL("./dist/content.js", import.meta.url), "utf8");
const visibleRect = { left: 10, right: 210, top: 10, bottom: 40, width: 200, height: 30 };

function fixtureNode(textContent: string): FixtureNode {
  return {
    textContent,
    isConnected: true,
    rect: visibleRect,
    getBoundingClientRect() { return this.rect; },
  };
}

function extractVisibleName(input: {
  platform: "instagram" | "linkedin";
  handle: string;
  pathname: string;
  identityHeadings?: FixtureNode[];
  globalHeadings?: FixtureNode[];
  preferredElement?: FixtureNode;
}): { name: unknown; queriedSelectors: string[] } {
  const mountCode = contentSource.lastIndexOf("\nminalyMount();");
  if (mountCode < 0) throw new Error("The extension content script has no mount entry point.");

  const queriedSelectors: string[] = [];
  const identityHeadings = input.identityHeadings ?? [];
  const globalHeadings = input.globalHeadings ?? [];
  const host = input.platform === "linkedin" ? "www.linkedin.com" : "www.instagram.com";
  const body = fixtureNode("");
  const window = {
    innerHeight: 1080,
    location: { hostname: host, origin: `https://${host}`, pathname: input.pathname, href: `https://${host}${input.pathname}` },
    getComputedStyle: () => ({ display: "block", visibility: "visible" }),
  };
  const document = {
    body,
    querySelectorAll(selector: string) {
      queriedSelectors.push(selector);
      if (selector === "h1, h2") return globalHeadings;
      if (selector.startsWith("textarea")) return [];
      if (selector.includes("main") || selector.includes("[role=main]")) return identityHeadings;
      return [];
    },
  };
  const context = createContext({ window, document, URL, testHandle: input.handle, preferredElement: input.preferredElement });
  runInContext(contentSource.slice(0, mountCode), context);

  return {
    name: runInContext("minalyVisibleName(testHandle, preferredElement)", context),
    queriedSelectors,
  };
}

describe("CRM extension profile name extraction", () => {
  it("uses the Instagram profile identity heading when it shows a display name", () => {
    const result = extractVisibleName({
      platform: "instagram",
      handle: "natgeo",
      pathname: "/natgeo/",
      identityHeadings: [fixtureNode("National Geographic")],
    });

    expect(result.name).toBe("National Geographic");
    expect(result.queriedSelectors).toContain("main header h1, main header h2, [role=main] header h1, [role=main] header h2");
  });

  it("uses LinkedIn's profile top-card heading instead of a sign-in prompt that mentions the company", () => {
    const result = extractVisibleName({
      platform: "linkedin",
      handle: "microsoft",
      pathname: "/company/microsoft/",
      identityHeadings: [fixtureNode("Microsoft")],
      globalHeadings: [fixtureNode("Identifiez-vous pour voir qui vous connaissez déjà chez Microsoft")],
    });

    expect(result.name).toBe("Microsoft");
    expect(result.queriedSelectors).toContain('main [data-view-name="profile-top-card"] h1, main .top-card-layout__title, main h1, [role="main"] h1');
    expect(result.queriedSelectors).not.toContain("h1, h2");
  });

  it("uses the identity heading after skipping a generic profile action in that area", () => {
    const result = extractVisibleName({
      platform: "linkedin",
      handle: "jane-doe",
      pathname: "/in/jane-doe/",
      identityHeadings: [fixtureNode("Voir Profil"), fixtureNode("Jane Doe")],
    });

    expect(result.name).toBe("Jane Doe");
  });

  it("falls back to the normalized handle when an Instagram conversation link is a generic action", () => {
    const result = extractVisibleName({
      platform: "instagram",
      handle: "@Drolitoo",
      pathname: "/direct/t/thread-123/",
      preferredElement: fixtureNode("Voir Profil"),
      identityHeadings: [fixtureNode("Other conversation")],
    });

    expect(result.name).toBe("drolitoo");
  });

  it("uses a reliable visible name from a LinkedIn conversation profile link", () => {
    const result = extractVisibleName({
      platform: "linkedin",
      handle: "jane-doe",
      pathname: "/messaging/thread/123/",
      preferredElement: fixtureNode("Jane Doe"),
    });

    expect(result.name).toBe("Jane Doe");
  });

  it("normalizes the platform handle when it is the only visible Instagram identity", () => {
    const result = extractVisibleName({
      platform: "instagram",
      handle: "@NatGeo",
      pathname: "/natgeo/",
      identityHeadings: [fixtureNode("natgeo")],
    });

    expect(result.name).toBe("natgeo");
  });
});
