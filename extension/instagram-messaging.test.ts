import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";

import { describe, expect, it } from "vitest";

type FixtureRect = { left: number; right: number; top: number; bottom: number; width: number; height: number };
type FixtureNode = {
  textContent: string;
  parentElement: FixtureNode | null;
  children: FixtureNode[];
  isConnected: boolean;
  rect: FixtureRect;
  attributes: Record<string, string>;
  getAttribute(name: string): string | null;
  getBoundingClientRect(): FixtureRect;
  contains(node: FixtureNode): boolean;
};

const contentSource = readFileSync(new URL("./dist/content.js", import.meta.url), "utf8");

function fixtureNode(textContent: string, rect: FixtureRect, attributes: Record<string, string> = {}): FixtureNode {
  const node: FixtureNode = {
    textContent,
    parentElement: null,
    children: [],
    isConnected: true,
    rect,
    attributes,
    getAttribute(name) { return this.attributes[name] ?? null; },
    getBoundingClientRect() { return this.rect; },
    contains(candidate) { return this.children.some((child) => child === candidate || child.contains(candidate)); },
  };
  return node;
}

function append(parent: FixtureNode, child: FixtureNode): void {
  parent.children.push(child);
  child.parentElement = parent;
}

function detectProfileTarget(pathname: string, profileAnchors: FixtureNode[], composers: FixtureNode[]): unknown {
  const mountCode = contentSource.lastIndexOf("\nminalyMount();");
  if (mountCode < 0) throw new Error("The extension content script has no mount entry point.");
  const body = fixtureNode("", { left: 0, right: 2048, top: 0, bottom: 1080, width: 2048, height: 1080 });
  const window = {
    innerHeight: 1080,
    location: {
      hostname: "www.instagram.com",
      origin: "https://www.instagram.com",
      pathname,
      href: `https://www.instagram.com${pathname}`,
    },
    getComputedStyle: () => ({ display: "block", visibility: "visible" }),
  };
  const document = {
    body,
    querySelectorAll: (selector: string) => selector.startsWith("a[") ? profileAnchors : composers,
  };
  const context = createContext({ window, document, URL });
  runInContext(contentSource.slice(0, mountCode), context);
  const result: unknown = runInContext("minalyProfileUrl()", context);
  return result;
}

function property(value: unknown, name: string): unknown {
  return value !== null && typeof value === "object" ? Reflect.get(value, name) : undefined;
}

describe("Instagram conversation targeting", () => {
  it("places the target profile ahead of the signed-in account in the full inbox", () => {
    const app = fixtureNode("", { left: 0, right: 2048, top: 0, bottom: 1080, width: 2048, height: 1080 });
    const selfLink = fixtureNode("clubvipfinance", { left: 80, right: 245, top: 24, bottom: 55, width: 165, height: 31 }, { href: "/clubvipfinance/" });
    const conversation = fixtureNode("", { left: 400, right: 2048, top: 0, bottom: 1080, width: 1648, height: 1080 });
    const header = fixtureNode("", { left: 400, right: 2048, top: 0, bottom: 60, width: 1648, height: 60 });
    const contactLink = fixtureNode("drolitoo", { left: 425, right: 510, top: 18, bottom: 42, width: 85, height: 24 }, { href: "/drolitoo/" });
    const footer = fixtureNode("", { left: 400, right: 2048, top: 990, bottom: 1060, width: 1648, height: 70 });
    const composer = fixtureNode("", { left: 410, right: 2030, top: 1010, bottom: 1055, width: 1620, height: 45 }, { placeholder: "Votre message..." });
    append(app, selfLink);
    append(app, conversation);
    append(conversation, header);
    append(header, contactLink);
    append(conversation, footer);
    append(footer, composer);

    const result = detectProfileTarget("/direct/t/thread-123/", [selfLink, contactLink], [composer]);
    expect(property(result, "handle")).toBe("drolitoo");
    expect(property(result, "url")).toBe("https://instagram.com/drolitoo");
    expect(property(result, "nameElement")).toBe(contactLink);
  });

  it("targets the open contact in a minimized chat panel over a profile page", () => {
    const app = fixtureNode("", { left: 0, right: 1280, top: 0, bottom: 800, width: 1280, height: 800 });
    const selfLink = fixtureNode("clubvipfinance", { left: 180, right: 310, top: 24, bottom: 50, width: 130, height: 26 }, { href: "/clubvipfinance/" });
    const chatPanel = fixtureNode("", { left: 48, right: 420, top: 36, bottom: 560, width: 372, height: 524 });
    const header = fixtureNode("", { left: 60, right: 400, top: 40, bottom: 95, width: 340, height: 55 });
    const contactLink = fixtureNode("drolitoo", { left: 132, right: 210, top: 54, bottom: 80, width: 78, height: 26 }, { href: "/drolitoo/" });
    const footer = fixtureNode("", { left: 60, right: 400, top: 490, bottom: 545, width: 340, height: 55 });
    const composer = fixtureNode("", { left: 66, right: 394, top: 496, bottom: 540, width: 328, height: 44 }, { placeholder: "Votre message..." });
    append(app, selfLink);
    append(app, chatPanel);
    append(chatPanel, header);
    append(header, contactLink);
    append(chatPanel, footer);
    append(footer, composer);

    const result = detectProfileTarget("/clubvipfinance/", [selfLink, contactLink], [composer]);
    expect(property(result, "handle")).toBe("drolitoo");
    expect(property(result, "nameElement")).toBe(contactLink);
  });

  it("does not fall back to the signed-in account when no conversation is open", () => {
    const selfLink = fixtureNode("clubvipfinance", { left: 80, right: 245, top: 24, bottom: 55, width: 165, height: 31 }, { href: "/clubvipfinance/" });

    const result = detectProfileTarget("/direct/inbox/", [selfLink], []);

    expect(result).toBeNull();
  });

  it("does not fall back to the signed-in profile when a minimized chat has no profile link", () => {
    const app = fixtureNode("", { left: 0, right: 1280, top: 0, bottom: 800, width: 1280, height: 800 });
    const selfLink = fixtureNode("clubvipfinance", { left: 600, right: 730, top: 24, bottom: 50, width: 130, height: 26 }, { href: "/clubvipfinance/" });
    const chatPanel = fixtureNode("", { left: 48, right: 420, top: 36, bottom: 560, width: 372, height: 524 });
    const footer = fixtureNode("", { left: 60, right: 400, top: 490, bottom: 545, width: 340, height: 55 });
    const composer = fixtureNode("", { left: 66, right: 394, top: 496, bottom: 540, width: 328, height: 44 }, { placeholder: "Votre message..." });
    append(app, selfLink);
    append(app, chatPanel);
    append(chatPanel, footer);
    append(footer, composer);

    const result = detectProfileTarget("/clubvipfinance/", [selfLink], [composer]);

    expect(result).toBeNull();
  });
});
