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
  return {
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
}

function append(parent: FixtureNode, child: FixtureNode): void {
  parent.children.push(child);
  child.parentElement = parent;
}

function detectProfileTarget(pathname: string, anchors: FixtureNode[], composers: FixtureNode[]): unknown {
  const mountCode = contentSource.lastIndexOf("\nminalyMount();");
  if (mountCode < 0) throw new Error("The extension content script has no mount entry point.");
  const body = fixtureNode("", { left: 0, right: 2048, top: 0, bottom: 1080, width: 2048, height: 1080 });
  const host = "www.linkedin.com";
  const window = {
    innerHeight: 1080,
    location: { hostname: host, origin: `https://${host}`, pathname, href: `https://${host}${pathname}` },
    getComputedStyle: () => ({ display: "block", visibility: "visible" }),
  };
  const document = {
    body,
    querySelectorAll(selector: string) {
      return selector.startsWith("a[") ? anchors : composers;
    },
  };
  const context = createContext({ window, document, URL });
  runInContext(contentSource.slice(0, mountCode), context);
  return runInContext("minalyProfileUrl()", context);
}

function property(value: unknown, name: string): unknown {
  return value !== null && typeof value === "object" ? Reflect.get(value, name) : undefined;
}

const pageRect = { left: 0, right: 2048, top: 0, bottom: 1080, width: 2048, height: 1080 };

describe("LinkedIn conversation targeting", () => {
  it("resolves the recipient from an open chat on the feed", () => {
    const app = fixtureNode("", pageRect);
    const selfLink = fixtureNode("Cédric Bernard", { left: 80, right: 230, top: 24, bottom: 52, width: 150, height: 28 }, { href: "/in/cedric-bernard/" });
    const chat = fixtureNode("", { left: 1100, right: 1900, top: 350, bottom: 1050, width: 800, height: 700 });
    const header = fixtureNode("", { left: 1110, right: 1890, top: 360, bottom: 425, width: 780, height: 65 });
    const recipientLink = fixtureNode("Jules Chenut", { left: 1160, right: 1280, top: 375, bottom: 405, width: 120, height: 30 }, { href: "/in/jules-chenut/" });
    const footer = fixtureNode("", { left: 1110, right: 1890, top: 970, bottom: 1040, width: 780, height: 70 });
    const composer = fixtureNode("", { left: 1120, right: 1880, top: 990, bottom: 1035, width: 760, height: 45 }, { placeholder: "Rédigez un message…" });
    append(app, selfLink);
    append(app, chat);
    append(chat, header);
    append(header, recipientLink);
    append(chat, footer);
    append(footer, composer);

    const result = detectProfileTarget("/feed/", [selfLink, recipientLink], [composer]);

    expect(property(result, "handle")).toBe("jules-chenut");
    expect(property(result, "url")).toBe("https://linkedin.com/in/jules-chenut");
    expect(property(result, "nameElement")).toBe(recipientLink);
  });

  it("resolves the recipient on a full LinkedIn messaging route", () => {
    const conversation = fixtureNode("", pageRect);
    const header = fixtureNode("", { left: 400, right: 2048, top: 0, bottom: 70, width: 1648, height: 70 });
    const recipientLink = fixtureNode("Jules Chenut", { left: 425, right: 570, top: 18, bottom: 45, width: 145, height: 27 }, { href: "/in/jules-chenut/" });
    const footer = fixtureNode("", { left: 400, right: 2048, top: 990, bottom: 1060, width: 1648, height: 70 });
    const composer = fixtureNode("", { left: 410, right: 2030, top: 1005, bottom: 1050, width: 1620, height: 45 }, { placeholder: "Message" });
    append(conversation, header);
    append(header, recipientLink);
    append(conversation, footer);
    append(footer, composer);

    const result = detectProfileTarget("/messaging/thread/abc/", [recipientLink], [composer]);

    expect(property(result, "handle")).toBe("jules-chenut");
    expect(property(result, "nameElement")).toBe(recipientLink);
  });

  it("does not resolve the signed-in profile as the chat recipient when identity is missing", () => {
    const app = fixtureNode("", pageRect);
    const selfLink = fixtureNode("Cédric Bernard", { left: 80, right: 230, top: 24, bottom: 52, width: 150, height: 28 }, { href: "/in/cedric-bernard/" });
    const chat = fixtureNode("", { left: 1100, right: 1900, top: 350, bottom: 1050, width: 800, height: 700 });
    const footer = fixtureNode("", { left: 1110, right: 1890, top: 970, bottom: 1040, width: 780, height: 70 });
    const composer = fixtureNode("", { left: 1120, right: 1880, top: 990, bottom: 1035, width: 760, height: 45 }, { placeholder: "Rédigez un message…" });
    append(app, selfLink);
    append(app, chat);
    append(chat, footer);
    append(footer, composer);

    expect(detectProfileTarget("/feed/", [selfLink], [composer])).toBeNull();
  });

  it("keeps profile-page targeting unchanged when there is no open chat", () => {
    const result = detectProfileTarget("/in/jules-chenut/", [], []);

    expect(property(result, "handle")).toBe("jules-chenut");
    expect(property(result, "url")).toBe("https://linkedin.com/in/jules-chenut");
  });
});
