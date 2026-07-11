// Vitest 4 + jsdom doesn't auto-cleanup the React tree between tests. Without
// this, render() calls accumulate — `getByRole("button")` etc. then find
// multiple matches and throw. Mirrors what @testing-library/react/vitest used
// to do via auto-import in earlier majors.
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
});
