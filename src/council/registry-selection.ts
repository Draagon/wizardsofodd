import type { WIZARD_REGISTRY } from "../personas/generated/registry";

type Registry = typeof WIZARD_REGISTRY;

/**
 * The council that runs when the visitor hasn't chosen a roster: every wizard
 * whose metadata marks it defaultEnabled. Registry order is preserved.
 * W2 adds an id-based selection layer on top of this default.
 */
export function defaultRegistry(registry: Registry): Registry {
  // filter() returns a mutable WizardRegistryEntry[]; cast back to the readonly Registry alias.
  return registry.filter((entry) => entry.wizard.defaultEnabled) as unknown as Registry;
}

/**
 * The council roster for a request: the visitor's explicitly-selected wizard
 * ids (filtered to ones that exist, preserving registry order), or — when no
 * valid ids are supplied — the defaultEnabled set. Never returns empty: an
 * empty/unknown selection falls back to the default council.
 */
export function selectRegistry(registry: Registry, ids?: readonly string[]): Registry {
  if (ids && ids.length > 0) {
    const wanted = new Set(ids);
    const picked = registry.filter((entry) => wanted.has(entry.wizard.id));
    if (picked.length > 0) return picked as unknown as Registry;
  }
  return defaultRegistry(registry);
}
