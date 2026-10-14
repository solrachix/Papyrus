import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(
    process.cwd(),
    "packages/engine-native/android/src/main/java/com/papyrus/engine/PapyrusComicDocumentView.java",
  ),
  "utf8",
);

const methodBody = (signature: string): string => {
  const start = source.indexOf(signature);
  if (start < 0) throw new Error(`Missing method ${signature}`);
  const bodyStart = source.indexOf("{", start);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(bodyStart, index + 1);
    }
  }
  throw new Error(`Unterminated method ${signature}`);
};

describe("Papyrus Android comic view contract", () => {
  it("keeps the page image in one container when changing layout modes", () => {
    const configurePageImage = methodBody("private void configurePageImage(");

    expect(source).toContain("pageScrollView.addView(image, new ScrollView.LayoutParams");
    expect(configurePageImage).not.toContain("removeView(holder.image)");
    expect(configurePageImage).not.toContain("cell.addView(holder.image");
    expect(configurePageImage).toContain("holder.pageScrollView.setVisibility(View.VISIBLE)");
  });

  it("bounds continuous pages to their cell height instead of scrolling inside each page", () => {
    const configurePageImage = methodBody("private void configurePageImage(");
    const measureContinuousChild = methodBody(
      "@Override protected void measureChild(View child, int parentWidthMeasureSpec, int parentHeightMeasureSpec)",
    );

    expect(configurePageImage).toContain("int pageHeight = itemParams.height");
    expect(configurePageImage).toContain("new ScrollView.LayoutParams(LayoutParams.MATCH_PARENT, pageHeight)");
    expect(configurePageImage).toContain("holder.pageScrollView.setFillViewport(false)");
    expect(configurePageImage).toContain("holder.pageScrollView.setFixedPageHeight(true)");
    expect(measureContinuousChild).toContain("MeasureSpec.makeMeasureSpec(params.height, MeasureSpec.EXACTLY)");
  });

  it("resizes the continuous page image and cell together during zoom", () => {
    const setZoom = methodBody("void setZoom(float value) {\n      imageZoom =");

    expect(setZoom).toContain("updatePageGeometryForZoom(comicHolder, position");
    expect(setZoom).not.toContain("applyPageHeightForDimensions(comicHolder, position");
    expect(setZoom).not.toContain("applyPageHeightForImage(comicHolder, position");
  });

  it("coalesces pinch events and only applies the latest zoom once per frame", () => {
    const onScale = methodBody("@Override public boolean onScale(ScaleGestureDetector detector)");
    const applyPending = methodBody("private void applyPendingZoom()");

    expect(onScale).toContain("zoomFrame.nextZoom(zoom, detector.getScaleFactor())");
    expect(onScale).toContain("zoomFrame.offer(next");
    expect(onScale).toContain("postOnAnimation(PapyrusComicDocumentView.this::applyPendingZoom)");
    expect(onScale).not.toContain("applyZoom(");
    expect(applyPending).toContain("zoomFrame.takePending()");
  });

  it("invalidates delayed anchor restoration when the document generation changes", () => {
    const restoreAnchor = methodBody("private void restoreVisibleAnchor(");

    expect(restoreAnchor).toContain("canRestoreAnchor(");
    expect(restoreAnchor).toContain("sourceLayoutManager != layoutManager");
  });

  it("anchors continuous zoom to the page under the pinch focus", () => {
    const applyZoom = methodBody("private void applyZoom(");

    expect(applyZoom).toContain("findChildViewUnder(focusX, focusY)");
    expect(applyZoom).toContain("zoomAnchorTopForItem(");
    expect(applyZoom).not.toContain("findFirstVisibleItemPosition()");
  });

  it("falls back to the nearest attached page when zoom focus is in the gap", () => {
    const applyZoom = methodBody("private void applyZoom(");
    const nearestPage = methodBody("private View findClosestVisiblePage(");

    expect(applyZoom).toContain("findClosestVisiblePage(focusX, focusY)");
    expect(nearestPage).toContain("recyclerView.getChildAt(i)");
    expect(nearestPage).toContain("bestDistance");
  });
});
