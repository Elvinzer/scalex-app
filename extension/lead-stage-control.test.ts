import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";

import { describe, expect, it } from "vitest";

const contentSource = readFileSync(new URL("./dist/content.js", import.meta.url), "utf8");
const mountCode = contentSource.lastIndexOf("\nminalyMount();");
if (mountCode < 0) throw new Error("The extension content script has no mount entry point.");

type TestElement = {
  tagName: string;
  children: TestElement[];
  className: string;
  textContent: string;
  value: string;
  selected: boolean;
  type: string;
  append: (...children: TestElement[]) => void;
  addEventListener: (type: string, listener: () => void) => void;
  click: () => void;
};

function createElement(tagName: string): TestElement {
  const children: TestElement[] = [];
  const listeners = new Map<string, () => void>();
  let value = "";
  const element: TestElement = {
    tagName,
    children,
    className: "",
    textContent: "",
    get value() {
      if (tagName !== "select") return value;
      return children.find((child) => child.selected)?.value ?? "";
    },
    set value(nextValue: string) {
      value = nextValue;
      if (tagName === "select") {
        for (const child of children) child.selected = child.value === nextValue;
      }
    },
    selected: false,
    type: "",
    append: (...nodes) => children.push(...nodes),
    addEventListener: (type, listener) => listeners.set(type, listener),
    click: () => listeners.get("click")?.(),
  };
  return element;
}

describe("CRM extension lead stage control", () => {
  it("saves the selected stage for an existing lead", () => {
    let update: unknown;
    const context = createContext({
      document: { createElement },
      lead: { id: "lead-1", stage: "first_message_sent" },
      onUpdate: (value: unknown) => { update = value; },
    });
    runInContext(contentSource.slice(0, mountCode), context);
    const controls = runInContext("minalyStageUpdateControls(lead, onUpdate)", context) as TestElement[];
    const stage = controls[0]?.children[1];
    const save = controls[1];

    expect(stage?.children.find((option) => option.value === "conversation_in_progress")?.textContent).toBe("Conversation en cours");
    if (!stage || !save) throw new Error("The extension stage controls were not created.");
    stage.value = "conversation_in_progress";
    save.click();

    expect(update).toMatchObject({ leadId: "lead-1", stage: "conversation_in_progress" });
  });
});
