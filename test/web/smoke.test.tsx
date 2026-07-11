import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { App } from "../../src/web/App";

describe("App smoke (jsdom)", () => {
  beforeEach(() => {
    (window as Window & { turnstile?: unknown }).turnstile = {
      render: vi.fn().mockReturnValue("widget-1"),
      reset: vi.fn(),
    };
  });

  it("renders the homepage masthead without crashing", () => {
    const { container } = render(<App />);
    expect(container.textContent).toContain("The Wizards of Odd");
  });
});
