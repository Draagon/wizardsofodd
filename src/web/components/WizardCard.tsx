import type { WizardTake, WizardTurn } from "../hooks/useCouncilStream";
import { Markdown } from "./Markdown";
import { portraitSrc, onPortraitError } from "./portrait";

interface Props {
  turn: WizardTurn;
}

// One wizard's contribution. Portrait is derived by convention
// (/portraits/<id>.webp) so adding/removing a wizard doesn't need a UI edit.
// On unknown wizard id (historical share page after a wizard was removed),
// the broken portrait is hidden via onError; the wizardName carries through.
export function WizardCard({ turn }: Props) {
  const portrait = portraitSrc(turn.wizardId);
  if (turn.kind === "error") {
    return (
      <article className="card card-error" aria-label={`${turn.wizardName} error`}>
        <img className="portrait" src={portrait} alt="" onError={onPortraitError} />
        <div className="body">
          <header>
            <h2>{turn.wizardName}</h2>
            <span className="stance stance-error">unable</span>
          </header>
          <p className="reason">{turn.reason ?? "(unknown error)"}</p>
        </div>
      </article>
    );
  }
  const take = turn.take as WizardTake;
  return (
    <article className="card card-wizard" aria-label={turn.wizardName}>
      <img className="portrait" src={portrait} alt="" onError={onPortraitError} />
      <div className="body">
        <header>
          <h2>{turn.wizardName}</h2>
          <span className={`stance stance-${take.stance}`}>{take.stance}</span>
          <span className="confidence" title={`confidence ${take.confidence}`}>
            {Math.round(take.confidence * 100)}%
          </span>
        </header>
        <Markdown source={take.takeMarkdown} className="take" />
        {take.keyClaims.length > 0 ? (
          <details className="key-claims">
            <summary>Key claims</summary>
            <ul>
              {take.keyClaims.map((c, i) => <li key={i}>{c}</li>)}
            </ul>
          </details>
        ) : null}
        {take.citations && take.citations.length > 0 ? (
          <details className="citations">
            <summary>Sources</summary>
            <ol>
              {take.citations.map((c, i) => (
                <li key={i}>
                  <a href={c.url} target="_blank" rel="noopener noreferrer">{c.title}</a>
                </li>
              ))}
            </ol>
          </details>
        ) : null}
      </div>
    </article>
  );
}
