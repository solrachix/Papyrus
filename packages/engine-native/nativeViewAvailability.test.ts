import { describe, expect, it, vi } from "vitest";

import { isNativeViewManagerRegistered } from "./nativeViewAvailability";

describe("isNativeViewManagerRegistered", () => {
  it("uses React Native's explicit view-manager registry probe", () => {
    const hasViewManagerConfig = vi.fn(() => true);

    expect(
      isNativeViewManagerRegistered(
        { hasViewManagerConfig },
        "PapyrusPdfDocumentView"
      )
    ).toBe(true);
    expect(hasViewManagerConfig).toHaveBeenCalledWith("PapyrusPdfDocumentView");
  });

  it("reports a missing manager and tolerates an unavailable probe", () => {
    expect(
      isNativeViewManagerRegistered({ hasViewManagerConfig: () => false }, "Missing")
    ).toBe(false);
    expect(isNativeViewManagerRegistered({}, "Missing")).toBe(false);
    expect(
      isNativeViewManagerRegistered(
        { hasViewManagerConfig: () => { throw new Error("unavailable"); } },
        "Missing"
      )
    ).toBe(false);
  });
});
