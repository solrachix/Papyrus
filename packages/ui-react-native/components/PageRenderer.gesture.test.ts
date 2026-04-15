import { describe, expect, it, vi } from "vitest";
import { buildCommentTapGestureDeps } from "./PageRenderer.gesture";

describe("buildCommentTapGestureDeps", () => {
  it("changes when annotation settings change", () => {
    const addAnnotationAt = vi.fn();

    const base = buildCommentTapGestureDeps({
      isNative: true,
      resolvedActiveTool: "comment",
      layoutWidth: 768,
      layoutHeight: 1024,
      annotationColor: "#111827",
      annotationOpacity: 1,
      inkStrokeWidth: 0.004,
      addAnnotationAt,
    });

    const changed = buildCommentTapGestureDeps({
      isNative: true,
      resolvedActiveTool: "comment",
      layoutWidth: 768,
      layoutHeight: 1024,
      annotationColor: "#f97316",
      annotationOpacity: 0.42,
      inkStrokeWidth: 0.01,
      addAnnotationAt,
    });

    expect(base).not.toEqual(changed);
  });
});
