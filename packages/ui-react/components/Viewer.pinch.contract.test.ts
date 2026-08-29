import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const viewerSource = readFileSync(
  resolve(process.cwd(), "packages/ui-react/components/Viewer.tsx"),
  "utf8"
);

describe("web Viewer pinch integration contract", () => {
  it("keeps engine and store side effects out of touchmove", () => {
    const touchMove = viewerSource.slice(
      viewerSource.indexOf("const handleTouchMove"),
      viewerSource.indexOf("const handleTouchEnd")
    );

    expect(touchMove).not.toContain("engine.setZoom");
    expect(touchMove).not.toContain("setDocumentState");
  });

  it("commits before clearing the preview transform", () => {
    const touchEnd = viewerSource.slice(
      viewerSource.indexOf("const handleTouchEnd"),
      viewerSource.indexOf("const handleTouchCancel")
    );

    expect(touchEnd).toContain("engine.setZoom(nextZoom)");
    expect(touchEnd).toContain("setDocumentState({ zoom: nextZoom })");
    expect(touchEnd.indexOf('style.transform = ""')).toBeGreaterThan(
      touchEnd.indexOf("engine.setZoom(nextZoom)")
    );
  });
});
