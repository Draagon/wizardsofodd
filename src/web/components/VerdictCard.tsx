import type { Verdict } from "../hooks/useCouncilStream";
import { Markdown } from "./Markdown";
import { portraitSrc, onPortraitError } from "./portrait";

interface Props {
  verdict: Verdict;
  /** Lookup helper: wizardId → wizardName, for rendering dissent portraits. */
  nameOf?: (wizardId: string) => string;
}

export function VerdictCard({ verdict, nameOf }: Props) {
  const agreements = verdict.agreements ?? [];
  const splits = verdict.splits ?? [];
  return (
    <article className="card card-verdict" aria-label="Verdict of the Guild">
      <img className="portrait" src="/portraits/verdict-seal.webp" alt="" onError={onPortraitError} />
      <div className="body">
        <header>
          <h2>Verdict of the Guild</h2>
          <span className={`stance stance-${verdict.stance}`}>{formatStance(verdict.stance)}</span>
          <span className="confidence" title={`confidence ${verdict.confidence}`}>
            {Math.round(verdict.confidence * 100)}%
          </span>
          <span className={`evidence evidence-${verdict.evidenceQuality}`}>
            evidence: {verdict.evidenceQuality}
          </span>
        </header>
        <Markdown source={verdict.takeMarkdown} className="take" />
        {agreements.length > 0 || splits.length > 0 || verdict.dissents.length > 0 ? (
          <details className="agreement-map">
            <summary>How the Guild agreed &amp; split</summary>
            {agreements.length > 0 ? (
              <div className="agreements">
                <h3>Where the Guild agreed</h3>
                <ul>{agreements.map((a, i) => <li key={i}>{a}</li>)}</ul>
              </div>
            ) : null}
            {splits.length > 0 ? (
              <div className="splits">
                <h3>Where they split</h3>
                <ul>{splits.map((s, i) => <li key={i}>{s}</li>)}</ul>
              </div>
            ) : null}
            {verdict.dissents.length > 0 ? (
              <div className="dissents">
                <h3>Dissents</h3>
                <ul>
                  {verdict.dissents.map((d, i) => (
                    <li key={i}>
                      <img
                        className="portrait portrait-mini"
                        src={portraitSrc(d.wizardId)}
                        alt=""
                        onError={onPortraitError}
                      />
                      <strong>{nameOf ? nameOf(d.wizardId) : d.wizardId}</strong>: {d.reason}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </details>
        ) : null}
        {verdict.verifyNote ? <p className="verify-note">{verdict.verifyNote}</p> : null}
      </div>
    </article>
  );
}

function formatStance(s: string): string {
  // Pretty-print "it_depends" → "It Depends" etc.
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
