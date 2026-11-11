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

// A persisted copy whose columns are nullable (a row has no note until one is
// stored), with names that differ from the owner's, plus a value view of the row.
const ROW_MODEL = `
metadata:
  package: demo
  children:
    - field.enum:
        name: mood
        abstract: true
        values: [calm, cross]
    - object.value:
        name: Note
        children:
          - field.string:
              name: title
              required: true
          - field.enum:
              name: mood
              extends: mood
              required: true
          - field.string:
              name: body
    - object.entity:
        name: NoteRow
        children:
          - source.rdb:
              table: note_rows
          - field.string:
              name: id
              required: true
          - field.string:
              name: noteTitle
              extends: Note.title
              required: false
          - field.enum:
              name: noteMood
              extends: Note.mood
              required: false
          - field.string:
              name: noteBody
              extends: Note.body
          - identity.primary:
              fields: [id]
    - object.value:
        name: NoteCard
        children:
          - field.string:
              name: noteTitle
              extends: NoteRow.noteTitle
          - field.enum:
              name: noteMood
              extends: mood
`;

async function generateRow(specs: LineageMapperSpec[]) {
  const { root, errors } = await MetaDataLoader.fromString(ROW_MODEL, "yaml");
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

describe("lineageMappers generator: extends chains and nullable rows", () => {
  it("pairs fields by their extends link even when the names differ", async () => {
    const [file] = await generateRow([{ from: "Note", to: "NoteRow" }]);
    expect(file.content).toContain("noteTitle: v.title,");
    expect(file.content).toContain("noteMood: v.mood,");
    expect(file.content).toContain("noteBody: v.body ?? null,");
  });

  it("pairs a same-named enum whose chain ends at the same abstract, through a concrete parent", async () => {
    const [file] = await generateRow([{ from: "NoteRow", to: "NoteCard", nullForAbsent: true }]);
    expect(file.content).toContain("noteTitle: v.noteTitle ?? null,");
    expect(file.content).toContain("noteMood: v.noteMood ?? null,");
  });

  it("refuses a plain reverse mapper when a required source field is read from a nullable column", async () => {
    await expect(generateRow([{ from: "Note", to: "NoteRow", reverse: true }])).rejects.toThrow(
      "required Note.title cannot be read from nullable NoteRow.noteTitle",
    );
  });

  it("emits a reverse mapper that returns null when a column a required field needs is NULL", async () => {
    const [file] = await generateRow([{ from: "Note", to: "NoteRow", reverse: "orNull" }]);
    expect(file.content).toContain("export function noteFromNoteRow(");
    expect(file.content).toContain("): Note | null {");
    expect(file.content).toContain("if (row.noteTitle == null || row.noteMood == null) return null;");
    expect(file.content).toContain("title: row.noteTitle,");
    expect(file.content).toContain("...(row.noteBody != null ? { body: row.noteBody } : {}),");
  });
});

describe("lineageMappers generator: one source field, two descendants", () => {
  it("refuses a target with two fields descending from the same source field", async () => {
    const { root, errors } = await MetaDataLoader.fromString(
      `
metadata:
  package: demo
  children:
    - object.value:
        name: Note
        children:
          - field.string:
              name: title
              required: true
    - object.value:
        name: TwoTitles
        children:
          - field.string:
              name: title
              extends: Note.title
          - field.string:
              name: heading
              extends: Note.title
`,
      "yaml",
    );
    expect(errors).toEqual([]);
    const ctx: GenContext = {
      entities: root.children().filter(isMetaObject),
      loadedRoot: root,
      matches: () => true,
      config: { outDir: "generated", extStyle: "none", dbImport: "./db", dialect: "sqlite" },
      warn: () => {},
    };
    await expect(lineageMappers([{ from: "Note", to: "TwoTitles" }]).generate(ctx)).rejects.toThrow(
      "TwoTitles.title and TwoTitles.heading both descend from Note.title",
    );
  });
});
