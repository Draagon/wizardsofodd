import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { HomePage } from "../../src/web/pages/HomePage";

describe("HomePage smoke", () => {
  beforeEach(() => {
    (window as Window & { turnstile?: unknown }).turnstile = {
      render: vi.fn().mockReturnValue("widget"),
      reset: vi.fn(),
    };
  });

  it("renders masthead + MeetTheGuild + AskForm without crashing", () => {
    const { container } = render(<HomePage turnstileSiteKey="x" />);
    expect(container.textContent).toContain("The Wizards of Odd");
    expect(container.textContent).toContain("Meet the Guild");
    expect(container.querySelector(".ask-form")).not.toBeNull();
  });

  it("does not render CouncilStream when idle", () => {
    const { container } = render(<HomePage turnstileSiteKey="x" />);
    expect(container.querySelector(".council")).toBeNull();
  });

  it("blocks Ask when every wizard is toggled off", () => {
    const { container, getByRole } = render(<HomePage turnstileSiteKey="x" />);
    container.querySelectorAll("button.guild-member").forEach((b) => fireEvent.click(b));
    expect((getByRole("button", { name: /ask the guild/i }) as HTMLButtonElement).disabled).toBe(true);
  });
});
