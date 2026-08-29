import { describe, expect, it } from "vitest";
import { createRenderGeneration } from "./renderGeneration";

describe("render generation", () => {
  it("accepts only the latest generation", () => {
    const generation = createRenderGeneration();
    const first = generation.next();
    const second = generation.next();

    expect(generation.isCurrent(first)).toBe(false);
    expect(generation.isCurrent(second)).toBe(true);
  });
});
