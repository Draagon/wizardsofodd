import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Markdown } from "../../src/web/components/Markdown";

describe("Markdown", () => {
  it("renders **bold** correctly", () => {
    const { container } = render(<Markdown source="hello **world**" />);
    expect(container.innerHTML).toContain("<strong>world</strong>");
  });

  it("escapes raw HTML in the source", () => {
    const { container } = render(<Markdown source="<script>alert(1)</script>" />);
    expect(container.innerHTML).not.toContain("<script>");
    expect(container.textContent).toContain("<script>");
  });

  it("applies className when given", () => {
    const { container } = render(<Markdown source="hi" className="prose" />);
    expect(container.firstElementChild?.className).toBe("prose");
  });
});
