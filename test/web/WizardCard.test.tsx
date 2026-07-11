import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { WizardCard } from "../../src/web/components/WizardCard";
import type { WizardTurn } from "../../src/web/hooks/useCouncilStream";

const WIZARD_TURN: WizardTurn = {
  kind: "wizard",
  wizardId: "grumbel",
  wizardName: "Grumbel the Overcaffeinated",
  take: {
    stance: "supports",
    takeMarkdown: "Just **ship it**.",
    oneLineSummary: "Ship.",
    confidence: 0.72,
    keyClaims: ["Risk is low", "Reward is high"],
  },
};

const ERROR_TURN: WizardTurn = {
  kind: "error",
  wizardId: "vexil",
  wizardName: "Madame Vexil",
  reason: "Riddle unparseable.",
};

describe("WizardCard", () => {
  it("renders wizard name + stance + confidence", () => {
    const { container } = render(<WizardCard turn={WIZARD_TURN} />);
    expect(container.textContent).toContain("Grumbel the Overcaffeinated");
    expect(container.textContent).toContain("supports");
    expect(container.textContent).toContain("72%");
  });

  it("derives portrait src from wizardId", () => {
    const { container } = render(<WizardCard turn={WIZARD_TURN} />);
    const img = container.querySelector("img.portrait") as HTMLImageElement;
    expect(img.getAttribute("src")).toBe("/portraits/grumbel.webp");
  });

  it("renders markdown take with <strong>", () => {
    const { container } = render(<WizardCard turn={WIZARD_TURN} />);
    expect(container.innerHTML).toContain("<strong>ship it</strong>");
  });

  it("renders key claims as <li>", () => {
    const { container } = render(<WizardCard turn={WIZARD_TURN} />);
    const items = container.querySelectorAll(".key-claims li");
    expect(items).toHaveLength(2);
    expect(items[0]?.textContent).toBe("Risk is low");
  });

  it("renders citations when present", () => {
    const turn: WizardTurn = {
      ...WIZARD_TURN,
      take: { ...WIZARD_TURN.take!, citations: [{ title: "T", url: "https://example.com", snippet: "S" }] },
    };
    const { container } = render(<WizardCard turn={turn} />);
    const link = container.querySelector(".citations a") as HTMLAnchorElement;
    expect(link.href).toBe("https://example.com/");
    expect(link.textContent).toBe("T");
  });

  it("renders error turn with reason", () => {
    const { container } = render(<WizardCard turn={ERROR_TURN} />);
    expect(container.textContent).toContain("Riddle unparseable");
    expect(container.querySelector(".stance-error")).not.toBeNull();
  });
});
