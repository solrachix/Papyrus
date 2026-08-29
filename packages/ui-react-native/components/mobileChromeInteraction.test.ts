import { describe, expect, it } from "vitest";
import { resolvePageTapChromeVisibility } from "./mobileChromeInteraction";

describe("page tap chrome interaction", () => {
  it("reveals hidden chrome on an empty page tap", () => {
    expect(resolvePageTapChromeVisibility({ chromeVisible: false })).toBe(true);
  });

  it("toggles visible chrome when the tap has no competing interaction", () => {
    expect(resolvePageTapChromeVisibility({ chromeVisible: true })).toBe(false);
  });

  it.each([
    { selectionActive: true },
    { annotationHit: true },
    { pinchActive: true },
    { toolActive: true },
    { contentInteraction: true },
  ])("does not toggle during %o", (blocked) => {
    expect(
      resolvePageTapChromeVisibility({ chromeVisible: false, ...blocked })
    ).toBeNull();
  });
});
