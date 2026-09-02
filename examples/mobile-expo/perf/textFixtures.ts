const LARGE_TEXT_LINE_COUNT = 1200;

export const textFixtures = {
  small: "Papyrus SDK\n\nThis is a text sample rendered by the mobile WebView runtime.",
  multiline: [
    "Papyrus multiline fixture",
    "line two",
    "line three",
    "",
    "paragraph after an empty line",
  ].join("\n"),
  unicode: [
    "Texto em português: ação, coração, maçã e ç.",
    "Aspas: ‘simples’, “duplas” e travessão — preservados.",
    "Caracteres não ASCII: café · € · 漢字 · 😀",
    "Quebra de linha abaixo.",
    "última linha",
  ].join("\n"),
  large: Array.from(
    { length: LARGE_TEXT_LINE_COUNT },
    (_, index) => `Linha ${index + 1}: conteúdo determinístico para o smoke de TXT.`,
  ).join("\n"),
  empty: "",
} as const;

export type TextFixtureName = keyof typeof textFixtures;
