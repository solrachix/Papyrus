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
});
