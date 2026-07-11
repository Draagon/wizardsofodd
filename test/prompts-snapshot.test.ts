import { describe, it, expect } from "vitest";
import { WIZARDS as GUILD } from "../src/personas/generated/wizards";

const getPersona = (id: string) => GUILD.find((p) => p.id === id);
import {
  buildWizardSystem,
  buildWizardMessages,
  buildVerdictSystem,
  buildVerdictMessages,
  type PriorTurn,
} from "../src/council/prompts";
import type { SearchResult } from "../src/llm/web-search";

const FIXED_QUESTION = "Should I quit my job to start a wizarding consultancy?";

// Use the real Persona objects so PriorTurn shape matches today's code.
const FIXED_PRIOR: PriorTurn[] = [
  {
    persona: getPersona("grumbel")!,
    take: {
      stance: "supports",
      takeMarkdown:
        "Don't overthink it — pick the option that gets you shipping by Tuesday and learn from the consequences.",
      oneLineSummary: "Ship to learn.",
      confidence: 0.7,
      keyClaims: ["Tight feedback loops beat planning.", "Action surfaces the real constraints."],
    },
  },
  {
    persona: getPersona("lorekeeper")!,
    take: {
      stance: "complicates",
      takeMarkdown:
        "The Bureau of Labor Statistics says new consultancies have a 5-year survival rate of 50%. Caveats apply.",
      oneLineSummary: "5-yr survival ~ 50%.",
      confidence: 0.6,
      keyClaims: ["BLS data exists.", "Survivor bias applies."],
    },
  },
];

const FIXED_SOURCES: SearchResult[] = [
  {
    title: "BLS small business survival",
    url: "https://example.com/a",
    // >300 chars on purpose: locks the buildWizardMessages truncation
    // behaviour (sources[].snippet is cut at 300 chars in the projection
    // layer to match pre-Phase-F byte output for Lorekeeper).
    content: "Half of new firms last 5 years. " + "x".repeat(400),
  },
  { title: "Indie hacker income survey 2025", url: "https://example.com/b", content: "Median: $42k year one." },
];

describe("prompt snapshots — baseline for Phase F byte-equivalence", () => {
  for (const wizard of GUILD) {
    it(`buildWizardSystem(${wizard.id}) is byte-stable`, () => {
      expect(buildWizardSystem(wizard, GUILD)).toMatchSnapshot();
    });

    it(`buildWizardMessages(${wizard.id}) is byte-stable for fixed inputs`, () => {
      const msgs = buildWizardMessages(
        FIXED_QUESTION,
        FIXED_PRIOR,
        wizard.id === "lorekeeper" ? FIXED_SOURCES : [],
      );
      expect(msgs).toMatchSnapshot();
    });
  }

  it("buildVerdictSystem is byte-stable", () => {
    expect(buildVerdictSystem(GUILD)).toMatchSnapshot();
  });

  it("buildVerdictMessages is byte-stable for fixed inputs", () => {
    const msgs = buildVerdictMessages(FIXED_QUESTION, [
      ...FIXED_PRIOR,
      {
        persona: getPersona("ozzimandias")!,
        take: {
          stance: "reframes",
          takeMarkdown: "Map the consequence tree out three moves.",
          oneLineSummary: "Look three moves ahead.",
          confidence: 0.55,
          keyClaims: ["Branching scenarios reveal hidden cost."],
        },
      },
      {
        persona: getPersona("pib")!,
        take: {
          stance: "supports",
          takeMarkdown: "Expected value: leaning yes if your runway is ≥ 9 months.",
          oneLineSummary: "Yes if runway >= 9mo.",
          confidence: 0.65,
          keyClaims: ["Runway is the binding constraint."],
        },
      },
      {
        persona: getPersona("vexil")!,
        take: {
          stance: "complicates",
          takeMarkdown: "What does the answer cost if you're wrong?",
          oneLineSummary: "Price the wrong answer.",
          confidence: 0.5,
          keyClaims: ["Downside framing changes the calculus."],
        },
      },
    ]);
    expect(msgs).toMatchSnapshot();
  });
});
