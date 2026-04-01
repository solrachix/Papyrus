import { describe, expect, it } from "vitest";
import { buildInfoRows } from "./infoSheetModel";

describe("buildInfoRows", () => {
  it("builds a complete mobile info summary from available viewer state", () => {
    const rows = buildInfoRows({
      title: "Sacramentadora.pdf",
      documentType: "pdf",
      currentPage: 3,
      pageCount: 1576,
      zoom: 1.25,
      rotation: 90,
      viewMode: "double",
      uiTheme: "dark",
      pageTheme: "sepia",
      locale: "pt-BR",
    });

    expect(rows).toEqual([
      { label: "Nome do arquivo", value: "Sacramentadora.pdf" },
      { label: "Tipo", value: "Documento PDF" },
      { label: "Páginas", value: "1576" },
      { label: "Página atual", value: "3" },
      { label: "Progresso", value: "0%" },
      { label: "Zoom", value: "125%" },
      { label: "Rotação", value: "90°" },
      { label: "Layout", value: "Página dupla" },
      { label: "Aparência", value: "Escuro" },
      { label: "Tema da página", value: "Sepia" },
      { label: "Idioma", value: "Português (BR)" },
    ]);
  });

  it("uses section-first and progress-first values for reflowable formats", () => {
    expect(
      buildInfoRows({
        title: "Book.epub",
        documentType: "epub",
        currentPage: 12,
        pageCount: 40,
        zoom: 1,
        rotation: 0,
        viewMode: "continuous",
        uiTheme: "light",
        pageTheme: "normal",
        locale: "en",
      }).find((row) => row.label === "Progress")?.value
    ).toBe("30%");

    expect(
      buildInfoRows({
        title: "Notes.txt",
        documentType: "text",
        currentPage: 6,
        pageCount: 10,
        zoom: 1,
        rotation: 0,
        viewMode: "continuous",
        uiTheme: "light",
        pageTheme: "normal",
        locale: "en",
      }).find((row) => row.label === "Progress")?.value
    ).toBe("60%");
  });
});
