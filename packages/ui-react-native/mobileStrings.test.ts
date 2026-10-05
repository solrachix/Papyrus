import { describe, expect, it } from "vitest";

import { getStrings } from "./mobileStrings";

describe("mobile selection toolbar strings", () => {
  it("provides Copy and Define labels in English and Brazilian Portuguese", () => {
    expect(getStrings("en")).toMatchObject({
      copy: "Copy",
      define: "Define",
    });
    expect(getStrings("pt-BR")).toMatchObject({
      copy: "Copiar",
      define: "Definir",
    });
  });

  it("provides the native annotation delete label in English and Brazilian Portuguese", () => {
    expect(getStrings("en").deleteAnnotation).toBe("Delete");
    expect(getStrings("pt-BR").deleteAnnotation).toBe("Apagar");
  });

  it("provides native annotation menu labels in English and Brazilian Portuguese", () => {
    expect(getStrings("en")).toMatchObject({
      annotate: "Annotate",
      annotationHighlight: "Highlight",
      annotationUnderline: "Underline",
      annotationStrikeout: "Strikeout",
      annotationSquiggly: "Squiggly",
      annotationNote: "Note",
    });
    expect(getStrings("pt-BR")).toMatchObject({
      annotate: "Anotar",
      annotationHighlight: "Destacar",
      annotationUnderline: "Sublinhar",
      annotationStrikeout: "Riscar",
      annotationSquiggly: "Ondulado",
      annotationNote: "Nota",
    });
  });
});
