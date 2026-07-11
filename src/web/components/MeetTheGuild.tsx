import { WIZARDS } from "../../personas/generated/wizards";

interface Props {
  /** Set of wizard ids currently enabled. */
  enabledIds: ReadonlySet<string>;
  /** Toggle a wizard on/off by id. */
  onToggle: (id: string) => void;
}

/**
 * Interactive guild gallery. Each wizard is a toggle button: click to
 * enable/disable, disabled wizards grey out (.guild-member-off). The technique
 * blurb is shown on hover/focus (and in the aria-label for screen readers).
 * Iterates the codegen'd WIZARDS array — adding a wizard via metadata adds a
 * card here with no TS edit.
 */
export function MeetTheGuild({ enabledIds, onToggle }: Props) {
  const count = enabledIds.size;
  return (
    <section className="guild" aria-label="Meet the Guild">
      <h2>Meet the Guild</h2>
      <p className="guild-count" aria-live="polite">{count} of {WIZARDS.length} wizards will answer</p>
      <ul className="guild-grid">
        {WIZARDS.map((w) => {
          const on = enabledIds.has(w.id);
          return (
            <li key={w.id}>
              <button
                type="button"
                className={`guild-member${on ? "" : " guild-member-off"}`}
                aria-pressed={on}
                aria-label={`${w.name}, ${w.title}. ${on ? "Enabled" : "Disabled"}. ${w.techniqueBlurb}`}
                onClick={() => onToggle(w.id)}
              >
                <img className="portrait portrait-small" src={`/portraits/${w.id}.webp`} alt="" />
                <strong>{w.name}</strong>
                <span className="title">{w.title}</span>
                <span className="technique">{w.technique}</span>
                <span className="technique-blurb">{w.techniqueBlurb}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
