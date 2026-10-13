import { describe, expect, it } from "vitest";
import {
  getReaderSelectionActionOptions,
  normalizeReaderSelectionActionId,
  READER_SELECTION_ACTIONS,
} from "./readerSelectionActions";

describe("shared reader selection actions", () => {
  it("uses one engine-neutral action vocabulary", () => {
    expect(READER_SELECTION_ACTIONS).toEqual({
      copy: "copy",
      highlight: "highlight",
      underline: "underline",
      note: "note",
      consult: "consult",
    });
  });

  it("localizes the same five actions for both EPUB renderers", () => {
    expect(getReaderSelectionActionOptions("pt-BR")).toEqual([
      {id: "copy", label: "Copiar"},
      {id: "highlight", label: "Destacar"},
      {id: "underline", label: "Sublinhar"},
      {id: "note", label: "Nota"},
      {id: "consult", label: "Consultar"},
    ]);
    expect(getReaderSelectionActionOptions("en").map(action => action.id)).toEqual([
      "copy", "highlight", "underline", "note", "consult",
    ]);
  });

  it("accepts older Papyrus menu IDs while exposing shared IDs", () => {
    expect(normalizeReaderSelectionActionId("comment")).toBe("note");
    expect(normalizeReaderSelectionActionId("define")).toBe("consult");
    expect(normalizeReaderSelectionActionId("selectAll")).toBeNull();
  });
});
