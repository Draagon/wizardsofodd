import { WizardCard } from "../web/components/WizardCard";
import { VerdictCard } from "../web/components/VerdictCard";
import { WIZARDS } from "../personas/generated/wizards";
import { councilVerdict, turnToWizardOutput, type CouncilWithTurns } from "../db/queries";
import type { WizardTurn, Verdict } from "../web/hooks/useCouncilStream";

interface Props {
  data: CouncilWithTurns;
}

export function SharePage({ data }: Props) {
  const { council, turns } = data;
  const nameOf = (id: string) => WIZARDS.find((w) => w.id === id)?.name ?? id;

  const toRecord = (t: CouncilWithTurns["turns"][number]): WizardTurn =>
    t.kind === "error"
      ? { kind: "error", wizardId: t.wizardId, wizardName: t.wizardName, reason: t.takeMarkdown }
      : { kind: "wizard", wizardId: t.wizardId, wizardName: t.wizardName, take: turnToWizardOutput(t) };

  const records = turns.map(toRecord);
  const verdict: Verdict | null =
    council.status === "complete" ? councilVerdict(council) : null;

  return (
    <main className="homepage share-page">
      <header className="masthead">
        <h1>The Wizards of Odd</h1>
      </header>
      <section className="question-block">
        <h2>The question</h2>
        <blockquote>{council.question}</blockquote>
      </section>
      <section className="council">
        {records.map((turn, i) => (
          <WizardCard key={i} turn={turn} />
        ))}
        {verdict ? <VerdictCard verdict={verdict} nameOf={nameOf} /> : null}
      </section>
    </main>
  );
}
