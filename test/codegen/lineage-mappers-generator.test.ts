import { describe, it, expect } from "vitest";
import type { GenContext } from "@metaobjectsdev/codegen-ts";
import { MetaDataLoader, isMetaObject } from "@metaobjectsdev/metadata";
import { lineageMappers, type LineageMapperSpec } from "../../src/codegen/lineage-mappers-generator";

// The lineage-mappers generator, run through its Generator interface against a
// small in-memory model. Note.title is required, Note.body is optional; NoteView
// descends from both, NoteTitle from the required one only.
const MODEL = `
metadata:
  package: demo
  children:
    - object.value:
        name: Note
        children:
          - field.string:
              name: title
              required: true
          - field.string:
              name: body
    - object.value:
        name: NoteView
        children:
          - field.string:
              name: title
              extends: Note.title
          - field.string:
              name: body
              extends: Note.body
    - object.value:
        name: NoteTitle
        children:
          - field.string:
              name: title
              extends: Note.title
`;

async function generate(specs: LineageMapperSpec[]) {
  const { root, errors } = await MetaDataLoader.fromString(MODEL, "yaml");
  expect(errors).toEqual([]);
  const ctx: GenContext = {
    entities: root.children().filter(isMetaObject),
    loadedRoot: root,
    matches: () => true,
    config: { outDir: "generated", extStyle: "none", dbImport: "./db", dialect: "sqlite" },
    warn: () => {},
  };
  return lineageMappers(specs).generate(ctx);
}

describe("lineageMappers generator", () => {
  it("refuses an optional source field onto a value-object field without nullForAbsent", async () => {
    const run = generate([{ from: "Note", to: "NoteView" }]);
    await expect(run).rejects.toThrow("Note.body");
    await expect(run).rejects.toThrow("NoteView.body");
    await expect(run).rejects.toThrow("nullForAbsent");
  });

  it("emits the mapper for the same pair once the spec sets nullForAbsent", async () => {
    const files = await generate([{ from: "Note", to: "NoteView", nullForAbsent: true }]);
    expect(files.map((f) => f.path)).toEqual(["NoteView.lineage.ts"]);
  });

  it("emits a value-object mapper without nullForAbsent when every copied field is required", async () => {
    const files = await generate([{ from: "Note", to: "NoteTitle" }]);
    expect(files.map((f) => f.path)).toEqual(["NoteTitle.lineage.ts"]);
  });
});
