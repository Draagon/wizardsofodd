import { describe, it, expect } from "vitest";
import {
  councilTurnFieldsFromWizardOutput,
  wizardOutputFromCouncilTurn,
} from "../src/db/generated/CouncilTurn.lineage";
import { turnLensFieldsFromWizardOutput } from "../src/db/generated/TurnLens.lineage";
import type { WizardOutput } from "../src/db/generated/WizardOutput";
import type { CouncilTurn } from "../src/db/generated/CouncilTurn";

// Lineage mappers are generated from field-level `extends: WizardOutput.<field>`
// (and same-named fields sharing an abstract, e.g. `stance` → wizardStance) in
// metaobjects/meta-council-turn.yaml and meta-turn-lens.yaml.

const TAKE: WizardOutput = {
  stance: "complicates",
  takeMarkdown: "It depends on the dragon.",
  oneLineSummary: "Dragon-dependent.",
  confidence: 0.4,
  keyClaims: ["dragons vary"],
  citations: [{ title: "Bestiary", url: "https://example.com/b", snippet: "..." }],
};

function rowFrom(take: WizardOutput): CouncilTurn {
  return {
    councilId: "abc12xyz",
    ordinal: 1,
    round: 0,
    wizardId: "pib",
    wizardName: "Pib the Small",
    kind: "wizard",
    ...councilTurnFieldsFromWizardOutput(take),
  };
}

describe("councilTurnFieldsFromWizardOutput", () => {
  it("copies every WizardOutput field onto its CouncilTurn column", () => {
    expect(councilTurnFieldsFromWizardOutput(TAKE)).toEqual({
      stance: "complicates",
      takeMarkdown: "It depends on the dragon.",
      oneLineSummary: "Dragon-dependent.",
      confidence: 0.4,
      keyClaims: ["dragons vary"],
      citations: [{ title: "Bestiary", url: "https://example.com/b", snippet: "..." }],
    });
  });

  it("stores an absent optional field as NULL", () => {
    const { citations: _omit, ...noCitations } = TAKE;
    expect(councilTurnFieldsFromWizardOutput(noCitations).citations).toBeNull();
  });
});

describe("wizardOutputFromCouncilTurn", () => {
  it("round-trips a take through its row", () => {
    expect(wizardOutputFromCouncilTurn(rowFrom(TAKE))).toEqual(TAKE);
  });

  it("omits an optional field whose column is NULL", () => {
    const { citations: _omit, ...noCitations } = TAKE;
    const out = wizardOutputFromCouncilTurn(rowFrom(noCitations));
    expect(out).toEqual(noCitations);
    expect("citations" in out).toBe(false);
  });
});

describe("turnLensFieldsFromWizardOutput", () => {
  it("projects only the take fields TurnLens declares", () => {
    expect(turnLensFieldsFromWizardOutput(TAKE)).toEqual({
      stance: "complicates",
      takeMarkdown: "It depends on the dragon.",
      oneLineSummary: "Dragon-dependent.",
      confidence: 0.4,
    });
  });
});
