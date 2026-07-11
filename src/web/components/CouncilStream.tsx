import type { StreamState } from "../hooks/useCouncilStream";
import { WizardCard } from "./WizardCard";
import { VerdictCard } from "./VerdictCard";
import { WIZARDS } from "../../personas/generated/wizards";

interface Props {
  state: StreamState;
}

export function CouncilStream({ state }: Props) {
  if (state.status === "idle") return null;
  const nameOf = (id: string) => WIZARDS.find((w) => w.id === id)?.name ?? id;
  return (
    <section className="council" aria-label="The Guild speaks">
      {state.wizardTurns.map((turn, i) => (
        <WizardCard key={`r0-${turn.wizardId}-${i}`} turn={turn} />
      ))}
      {state.verdict ? <VerdictCard verdict={state.verdict} nameOf={nameOf} /> : null}

      {state.status === "error" ? (
        <article className="card card-stream-error"><p>The tower went dark: {state.errorMessage}</p></article>
      ) : null}
    </section>
  );
}
