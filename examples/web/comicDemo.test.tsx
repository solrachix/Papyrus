// @vitest-environment node

import { describe, expect, it } from "vitest";

import { CBZEngine } from "@papyrus-sdk/engine-cbz";
import { createDemoCbz } from "./comicDemo";

describe("comic demo fixture", () => {
  it("loads as an ordered CBZ document", async () => {
    const dataUri = await createDemoCbz();
    const engine = new CBZEngine();
    await engine.load(dataUri);

    expect(engine.getPageCount()).toBe(2);
    engine.destroy();
  });
});
