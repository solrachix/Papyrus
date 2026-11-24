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

  it("provides the original rotation reset label in English and Brazilian Portuguese", () => {
    expect(getStrings("en").rotationOriginal).toBe("Original / 0°");
    expect(getStrings("pt-BR").rotationOriginal).toBe("Original / 0°");
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

describe("Brazilian Portuguese reader strings", () => {
  const pt = getStrings("pt-BR") as Record<string, string>;
  const en = getStrings("en") as Record<string, string>;

  it("covers every English key", () => {
    expect(Object.keys(pt).sort()).toEqual(Object.keys(en).sort());
    for (const [key, value] of Object.entries(pt)) {
      expect(value, key).toBeTruthy();
    }
  });

  it("uses accented Portuguese in the display settings", () => {
    expect(pt).toMatchObject({
      display: "Exibição",
      appearance: "Aparência",
      pageTransition: "Transição de página",
      continuous: "Contínuo",
      pageByPage: "Página por página",
      singlePage: "Página única",
      doublePage: "Página dupla",
      clockwise: "Sentido horário",
      counterclockwise: "Sentido anti-horário",
      pageTheme: "Tema da página",
      themeSepia: "Sépia",
      english: "Inglês",
      portuguese: "Português (BR)",
      comicFitWidth: "Ajustar à largura",
    });
  });

  it("never falls back to unaccented spellings", () => {
    const unaccented =
      /\b(Pagina|pagina|Paginas|paginas|Sumario|sumario|Transicao|Continuo|unica|horario|Aparencia|Exibicao|Sepia|Ingles|Portugues|anotacoes|titulo|Informacoes|configuracoes|navegacao|Numero|capitulo|acoes)\b/;
    for (const [key, value] of Object.entries(pt)) {
      expect(value, key).not.toMatch(unaccented);
    }
  });
});
