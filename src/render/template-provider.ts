// Runtime Provider over the inlined templates. Cloudflare Workers can't read
// from the filesystem, so the `mustache-templates` MO generator (run by
// `meta gen`) inlines every data/templates/**/*.mustache file into TEMPLATES;
// this Provider just wraps that record so the render layer can resolve refs by
// `group/source`.
import { InMemoryProvider, type Provider } from "@metaobjectsdev/render";
import { TEMPLATES } from "./generated/templates";

export const templateProvider: Provider = new InMemoryProvider(TEMPLATES);
