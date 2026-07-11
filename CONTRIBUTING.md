# Contributing to Wizards of Odd

Thanks for your interest! **Wizards of Odd is a reference implementation** — a real,
running app that exists to show how [MetaObjects](https://metaobjects.dev) drives a
single metadata spine into a database schema, API types, LLM prompts, and the SSE
wire protocol, all drift-gated in CI. That purpose shapes what we can accept.

## What's welcome

- **Bug reports and fixes** — something broken, a typo, a doc that's wrong or unclear.
- **Documentation improvements** — clearer explanations of how the metadata spine works.
- **Reproductions** — if you can show the drift gate missing a real divergence (or
  flagging a false one), that's a great issue.

## What's out of scope

- **New product features.** The feature set is intentionally frozen — this is a
  teaching artifact, not a product. New wizards, new game modes, and new surfaces
  would dilute the "one spine, many outputs" story it's meant to demonstrate.
- **Questions about MetaObjects itself** (the metadata standard, codegen, the CLI,
  the drift gate). Those belong **upstream** at
  [github.com/metaobjectsdev/metaobjects](https://github.com/metaobjectsdev/metaobjects)
  or [metaobjects.dev](https://metaobjects.dev) — not here.

## Before you open a PR

1. Open an issue first for anything beyond a typo, so we can agree it fits the scope above.
2. Keep the metadata the single source of truth: change the YAML under `metaobjects/`,
   then run `npm run gen:db` — never hand-edit generated files.
3. Run the drift gate locally and make sure it's green:

   ```
   npm run demo:drift
   ```

4. Keep the history clean; one focused change per PR.

## Building on MetaObjects yourself?

If you're adopting MetaObjects in your own project, we'd love to hear about it —
open an issue and say hi.
