import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { VerdictCard } from "../../src/web/components/VerdictCard";
import type { Verdict } from "../../src/web/hooks/useCouncilStream";

const VERDICT: Verdict = {
  stance: "it_depends",
  confidence: 0.42,
  takeMarkdown: "**Maybe**, with caveats.",
  dissents: [
    { wizardId: "vexil", reason: "The premise itself is suspect." },
  ],
  evidenceQuality: "mixed",
};

describe("VerdictCard", () => {
  it("renders pretty stance + confidence + evidence quality", () => {
    const { container } = render(<VerdictCard verdict={VERDICT} />);
    expect(container.textContent).toContain("It Depends");
    expect(container.textContent).toContain("42%");
    expect(container.textContent).toContain("evidence: mixed");
  });

  it("renders verdict markdown", () => {
    const { container } = render(<VerdictCard verdict={VERDICT} />);
    expect(container.innerHTML).toContain("<strong>Maybe</strong>");
  });

  it("renders dissents with portraits", () => {
    const { container } = render(<VerdictCard verdict={VERDICT} nameOf={(id) => id === "vexil" ? "Madame Vexil" : id} />);
    const li = container.querySelector(".dissents li");
    expect(li?.textContent).toContain("Madame Vexil");
    expect(li?.textContent).toContain("premise itself is suspect");
    expect((li?.querySelector("img.portrait-mini") as HTMLImageElement).getAttribute("src")).toBe("/portraits/vexil.webp");
  });

  it("omits the dissents section when none", () => {
    const { container } = render(<VerdictCard verdict={{ ...VERDICT, dissents: [] }} />);
    expect(container.querySelector(".dissents")).toBeNull();
  });

  it("renders the agree/split map and verify note when present", () => {
    const verdict = {
      stance: "it_depends" as const, confidence: 0.5, takeMarkdown: "body", dissents: [],
      evidenceQuality: "mixed" as const,
      agreements: ["all agree the runway is short"],
      splits: ["quit now vs wait for funding"],
      verifyNote: "Verify your finances before acting.",
    };
    const { getByText, container } = render(<VerdictCard verdict={verdict} />);
    expect(getByText("all agree the runway is short")).toBeTruthy();
    expect(getByText("quit now vs wait for funding")).toBeTruthy();
    expect(container.querySelector(".verify-note")?.textContent).toContain("Verify your finances");
  });

  it("omits the map and verify note when the fields are absent", () => {
    const verdict = {
      stance: "no" as const, confidence: 0.2, takeMarkdown: "body", dissents: [],
      evidenceQuality: "thin" as const,
    };
    const { container } = render(<VerdictCard verdict={verdict} />);
    expect(container.querySelector(".agreement-map")).toBeNull();
    expect(container.querySelector(".verify-note")).toBeNull();
  });
});
