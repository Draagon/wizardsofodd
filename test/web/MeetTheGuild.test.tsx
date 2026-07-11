import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { MeetTheGuild } from "../../src/web/components/MeetTheGuild";
import { WIZARDS } from "../../src/personas/generated/wizards";

const allIds = new Set(WIZARDS.map((w) => w.id));

describe("MeetTheGuild (interactive)", () => {
  it("renders one toggle button per wizard", () => {
    const { container } = render(<MeetTheGuild enabledIds={allIds} onToggle={vi.fn()} />);
    expect(container.querySelectorAll("button.guild-member")).toHaveLength(WIZARDS.length);
  });

  it("marks disabled wizards with aria-pressed=false and the off class", () => {
    const someOff = new Set([...allIds].filter((id) => id !== "brik"));
    const { container } = render(<MeetTheGuild enabledIds={someOff} onToggle={vi.fn()} />);
    const brikBtn = container.querySelector('button[aria-label*="Brik"]') as HTMLButtonElement;
    expect(brikBtn.getAttribute("aria-pressed")).toBe("false");
    expect(brikBtn.className).toContain("guild-member-off");
  });

  it("fires onToggle with the wizard id on click", () => {
    const onToggle = vi.fn();
    const { container } = render(<MeetTheGuild enabledIds={allIds} onToggle={onToggle} />);
    const btn = container.querySelector('button[aria-label*="Grumbel"]') as HTMLButtonElement;
    fireEvent.click(btn);
    expect(onToggle).toHaveBeenCalledWith("grumbel");
  });

  it("shows the technique blurb and a live count", () => {
    const twoOn = new Set(["grumbel", "pib"]);
    const { container, getByText } = render(<MeetTheGuild enabledIds={twoOn} onToggle={vi.fn()} />);
    expect(container.textContent).toContain(WIZARDS[0].techniqueBlurb);
    expect(getByText(`2 of ${WIZARDS.length} wizards will answer`)).toBeTruthy();
  });
});
