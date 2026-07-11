import { useCallback, useState } from "react";
import { WIZARDS } from "../../personas/generated/wizards";

export const SELECTION_STORAGE_KEY = "woo_wizard_selection";

function seedDefault(): Set<string> {
  return new Set(WIZARDS.filter((w) => w.defaultEnabled).map((w) => w.id));
}

/** Read persisted selection, dropping any ids that are no longer in the roster. */
function loadSelection(): Set<string> {
  try {
    const raw = localStorage.getItem(SELECTION_STORAGE_KEY);
    if (!raw) return seedDefault();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return seedDefault();
    const valid = new Set(WIZARDS.map((w) => w.id));
    const kept = new Set(parsed.filter((id): id is string => typeof id === "string" && valid.has(id)));
    // An empty stored selection (all ids stale, or the user had toggled every
    // wizard off before reloading) is not a useful saved state — re-seed to the
    // default set, mirroring selectRegistry's "never empty" fallback on the server.
    return kept.size > 0 ? kept : seedDefault();
  } catch {
    return seedDefault();
  }
}

export function useWizardSelection() {
  const [enabledIds, setEnabledIds] = useState<Set<string>>(loadSelection);

  const toggle = useCallback((id: string) => {
    setEnabledIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem(SELECTION_STORAGE_KEY, JSON.stringify([...next]));
      } catch {
        // storage denied/full — selection still works in-memory for this session
      }
      return next;
    });
  }, []);

  return { enabledIds, toggle, count: enabledIds.size };
}
