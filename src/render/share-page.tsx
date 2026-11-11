import { WizardCard } from "../web/components/WizardCard";
import { VerdictCard } from "../web/components/VerdictCard";
import { WIZARDS } from "../personas/generated/wizards";
import { verdictOutputFromCouncil } from "../db/generated/Council.lineage";
import { wizardOutputFromCouncilTurn } from "../db/generated/CouncilTurn.lineage";
import { CouncilTurnKindEnum } from "../db/generated/CouncilTurn";
import { COUNCIL_EVENTS } from "../web/generated/council-frames";
import type { CouncilWithTurns } from "../db/generated/Council.queries";
import type { WizardTurn, Verdict } from "../web/hooks/useCouncilStream";
import { CouncilStatusEnum } from "../db/generated/Council";

interface Props {
  data: CouncilWithTurns;
}

export function SharePage({ data }: Props) {
  const { council, turns } = data;
  const nameOf = (id: string) => WIZARDS.find((w) => w.id === id)?.name ?? id;

  const toRecord = (t: CouncilWithTurns["turns"][number]): WizardTurn =>
    t.kind === CouncilTurnKindEnum.enum.error
      ? { kind: COUNCIL_EVENTS.error, wizardId: t.wizardId, wizardName: t.wizardName, reason: t.takeMarkdown }
      : { kind: COUNCIL_EVENTS.wizard, wizardId: t.wizardId, wizardName: t.wizardName, take: wizardOutputFromCouncilTurn(t) };

  const records = turns.map(toRecord);
  const verdict: Verdict | null =
    council.status === CouncilStatusEnum.enum.complete ? verdictOutputFromCouncil(council) : null;

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
