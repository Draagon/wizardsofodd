import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { CouncilStream } from "../../src/web/components/CouncilStream";
import type { StreamState } from "../../src/web/hooks/useCouncilStream";

const base: StreamState = {
  status: "complete", slug: "abc",
  wizardTurns: [{ kind: "wizard", wizardId: "grumbel", wizardName: "Grumbel", take: { stance: "supports", takeMarkdown: "a take", oneLineSummary: "t", confidence: 0.5, keyClaims: [] } }],
  verdict: { stance: "yes", confidence: 1, takeMarkdown: "the verdict", dissents: [], evidenceQuality: "thin" },
  errorMessage: null,
};

describe("CouncilStream", () => {
  it("renders the wizard turns and the verdict", () => {
    const { container } = render(<CouncilStream state={base} />);
    expect(container.textContent).toContain("Grumbel");
    expect(container.textContent).toContain("a take");
    expect(container.textContent).toContain("the verdict");
  });

  it("renders nothing while idle", () => {
    const { container } = render(<CouncilStream state={{ ...base, status: "idle" }} />);
    expect(container.firstChild).toBeNull();
  });

  it("shows the stream-error card on error", () => {
    const { container } = render(<CouncilStream state={{ ...base, status: "error", errorMessage: "boom" }} />);
    const err = container.querySelector(".card-stream-error");
    expect(err).toBeTruthy();
    expect(err?.textContent).toContain("boom");
  });
});
