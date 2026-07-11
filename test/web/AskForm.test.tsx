import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { AskForm } from "../../src/web/components/AskForm";

describe("AskForm", () => {
  beforeEach(() => {
    // Mock window.turnstile to immediately fire the callback with a fake token.
    (window as Window & { turnstile?: unknown }).turnstile = {
      render: (_el: HTMLElement, opts: { callback: (t: string) => void }) => {
        opts.callback("test-token");
        return "widget-1";
      },
      reset: () => {},
    };
    // Mock loadTurnstileScript path: pre-attach the script so the loader resolves immediately.
    if (!document.querySelector(`script[src*="turnstile/v0/api.js"]`)) {
      const s = document.createElement("script");
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
      document.head.appendChild(s);
    }
  });

  it("disables submit when question is empty", () => {
    const { getByRole } = render(<AskForm siteKey="x" onSubmit={vi.fn()} busy={false} />);
    expect((getByRole("button") as HTMLButtonElement).disabled).toBe(true);
  });

  it("enables submit once question typed and turnstile fires", async () => {
    const onSubmit = vi.fn();
    const { getByRole, getByPlaceholderText } = render(<AskForm siteKey="x" onSubmit={onSubmit} busy={false} />);
    fireEvent.change(getByPlaceholderText(/wizarding consultancy/), { target: { value: "What now?" } });
    await waitFor(() => expect((getByRole("button") as HTMLButtonElement).disabled).toBe(false));
  });

  it("calls onSubmit with question + token when submitted", async () => {
    const onSubmit = vi.fn();
    const { getByRole, getByPlaceholderText } = render(<AskForm siteKey="x" onSubmit={onSubmit} busy={false} />);
    fireEvent.change(getByPlaceholderText(/wizarding consultancy/), { target: { value: "What?" } });
    await waitFor(() => expect((getByRole("button") as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(getByRole("button"));
    expect(onSubmit).toHaveBeenCalledWith("What?", "test-token");
  });

  it("renders busy state", () => {
    const { getByRole } = render(<AskForm siteKey="x" onSubmit={vi.fn()} busy={true} />);
    expect(getByRole("button").textContent).toMatch(/deliberat/i);
    expect((getByRole("button") as HTMLButtonElement).disabled).toBe(true);
  });

  it("blocks submit and shows a message when blocked", () => {
    const { getByRole, getByText } = render(
      <AskForm siteKey="x" onSubmit={vi.fn()} busy={false} blocked blockedMessage="Enable at least one wizard." />,
    );
    expect((getByRole("button") as HTMLButtonElement).disabled).toBe(true);
    expect(getByText("Enable at least one wizard.")).toBeTruthy();
  });
});
