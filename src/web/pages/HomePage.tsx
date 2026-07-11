import { MeetTheGuild } from "../components/MeetTheGuild";
import { AskForm } from "../components/AskForm";
import { CouncilStream } from "../components/CouncilStream";
import { ShareAffordance } from "../components/ShareAffordance";
import { useCouncilStream } from "../hooks/useCouncilStream";
import { useWizardSelection } from "../hooks/useWizardSelection";

interface Props {
  /** Site key threaded from Vite env var (VITE_TURNSTILE_SITE_KEY). */
  turnstileSiteKey: string;
}

export function HomePage({ turnstileSiteKey }: Props) {
  const { state, start } = useCouncilStream();
  const { enabledIds, toggle, count } = useWizardSelection();
  const isBusy = state.status === "streaming";
  const isComplete = state.status === "complete" && state.slug !== null;

  return (
    <main className="homepage">
      <header className="masthead">
        <h1>The Wizards of Odd</h1>
        <p className="tagline">A guild of odd minds, each with its own way of thinking. Ask, and see your question through many lenses.</p>
      </header>
      <MeetTheGuild enabledIds={enabledIds} onToggle={toggle} />
      <AskForm
        siteKey={turnstileSiteKey}
        onSubmit={(question, token) => start(question, token, [...enabledIds])}
        busy={isBusy}
        blocked={count === 0}
        blockedMessage="Enable at least one wizard to ask the Guild."
      />
      <CouncilStream state={state} />
      {isComplete && state.slug !== null ? <ShareAffordance slug={state.slug} /> : null}
    </main>
  );
}
