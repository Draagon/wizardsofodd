import { describe, it, expect } from "vitest";
import { buildWizardSystem, buildWizardMessages, buildVerdictSystem, buildVerdictMessages } from "../src/council/prompts";
import { WIZARDS as GUILD } from "../src/personas/generated/wizards";

const getPersona = (id: string) => GUILD.find((p) => p.id === id);
import type { Wizard } from "../src/db/generated/Wizard";
import type { WizardOutput } from "../src/db/generated/WizardOutput";

const grumbel = getPersona("grumbel")!;

// Phase O: PriorTurn now carries a structured WizardOutput. This helper keeps
// the per-test fixtures one-liner-ish — only the takeMarkdown varies, the rest
// is realistic-enough scaffolding for the assertions below (which check the
// rendered prose, not the structured fields).
const take = (takeMarkdown: string): WizardOutput => ({
  stance: "supports",
  takeMarkdown,
  oneLineSummary: takeMarkdown.slice(0, 80),
  confidence: 0.5,
  keyClaims: [],
});

describe("prompt builders", () => {
  it("wizard system prompt includes name, quirk, voice rules and refusal style", () => {
    // Phase F: per-wizard prose lives in templates, not on the Wizard shape.
    // Spot-check Grumbel's distinctive phrases come through the template.
    const sys = buildWizardSystem(grumbel, GUILD);
    expect(sys).toContain("Grumbel the Overcaffeinated");
    expect(sys).toContain("catastrophizes every possible outcome");          // quirk
    expect(sys).toContain("Short, jittery sentences");                       // voiceRules
    expect(sys).toContain("spiraling about how that exact request");         // refusalStyle
  });

  it("wizard system prompt names the wizards it bickers with", () => {
    const sys = buildWizardSystem(grumbel, GUILD);
    expect(sys).toContain("Ozzimandias"); // grumbel.bickersWith includes ozzimandias
  });

  it("wizard messages carry the question and prior wizards' words", () => {
    const msgs = buildWizardMessages("should I rewrite it?", [
      { persona: getPersona("vexil")!, take: take("A door once opened...") },
    ]);
    const joined = msgs.map((m) => m.content).join("\n");
    expect(joined).toContain("should I rewrite it?");
    expect(joined).toContain("Madame Vexil");
    expect(joined).toContain("A door once opened...");
    expect(msgs[msgs.length - 1].role).toBe("user");
  });

  it("verdict prompt asks for reconciliation and allows disagreement", () => {
    const sys = buildVerdictSystem(GUILD);
    expect(sys.toLowerCase()).toContain("verdict");
    const msgs = buildVerdictMessages("q?", [{ persona: grumbel, take: take("ship nothing ever") }]);
    expect(msgs.map((m) => m.content).join("\n")).toContain("ship nothing ever");
  });

  it("wizard messages with no prior turns use the first-speaker prompt", () => {
    const msgs = buildWizardMessages("Is magic real?", []);
    expect(msgs).toHaveLength(1);
    expect(msgs[0].role).toBe("user");
    expect(msgs[0].content).toContain("Is magic real?");
    expect(msgs[0].content).toContain("first to speak");
    expect(msgs[0].content).not.toContain("Wizards who have already spoken");
  });

  it("wizard system prompt omits the rivals line when bickersWith is empty", () => {
    const loner: Wizard = { ...grumbel, bickersWith: [] };
    const sys = buildWizardSystem(loner, GUILD);
    expect(sys).not.toContain("bicker");
  });

  it("wizard system prompt includes the persona's technique name and instructions", () => {
    // Phase F: technique name and instructions live in the per-wizard system
    // Mustache template. Each wizard's `technique` tag must appear in their
    // rendered system prompt, marked as `**<tag>**`.
    for (const p of GUILD) {
      const sys = buildWizardSystem(p, GUILD);
      expect(sys, `${p.id} prompt missing technique tag`).toContain(`**${p.technique}**`);
      // Sanity-check: enough body to be more than just the tag.
      expect(sys.length, `${p.id} prompt suspiciously short`).toBeGreaterThan(500);
    }
  });

  it("wizard messages include a Sources block when sources are provided", () => {
    const sources = [
      { title: "Wikipedia: rewrite", url: "https://en.wikipedia.org/wiki/Rewrite_(programming)", content: "A rewrite is..." },
      { title: "SO: when to rewrite", url: "https://stackoverflow.com/q/123", content: "Joel Spolsky famously..." },
    ];
    const msgs = buildWizardMessages("should I rewrite?", [], sources);
    const content = msgs[0].content;
    expect(content).toContain("## Sources");
    expect(content).toContain("Wikipedia: rewrite");
    expect(content).toContain("https://en.wikipedia.org/wiki/Rewrite_(programming)");
    expect(content).toContain("Joel Spolsky famously");
  });

  it("wizard messages omit the Sources block when no sources provided", () => {
    const msgs = buildWizardMessages("q?", []);
    expect(msgs[0].content).not.toContain("## Sources");
  });

  it("wizard messages with sources AND prior turns include both", () => {
    const grumbel2 = getPersona("grumbel")!;
    const msgs = buildWizardMessages("q?", [{ persona: grumbel2, take: take("prior text") }], [
      { title: "T", url: "https://u", content: "C" },
    ]);
    expect(msgs[0].content).toContain("prior text");
    expect(msgs[0].content).toContain("## Sources");
    expect(msgs[0].content).toContain("T");
  });

  it("verdict system prompt includes the 4-point structure cues", () => {
    const sys = buildVerdictSystem(GUILD).toLowerCase();
    expect(sys).toContain("convergence");
    expect(sys).toContain("disagree");
    expect(sys).toContain("relevance");
    expect(sys).toContain("confidence");
  });

  it("verdict system prompt mandates a closing confidence two-liner", () => {
    const sys = buildVerdictSystem(GUILD);
    expect(sys).toContain("High confidence:");
    expect(sys).toContain("Open question:");
  });
});
