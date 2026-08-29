import test from "node:test";
import assert from "node:assert/strict";

const modulePath = new URL("../dist/gesture/pinchZoom.mjs", import.meta.url);
const pinchZoom = await import(modulePath);

test("createPinchSession starts from the initial distance and zoom", () => {
  const session = pinchZoom.createPinchSession(
    [
      { pageX: 0, pageY: 0 },
      { pageX: 0, pageY: 100 },
    ],
    1.25
  );

  assert.deepEqual(session, {
    initialDistance: 100,
    initialZoom: 1.25,
  });
});

test("resolvePinchZoomChange scales zoom from the pinch distance", () => {
  const session = {
    initialDistance: 100,
    initialZoom: 1,
  };

  const nextZoom = pinchZoom.resolvePinchZoomChange(
    session,
    [
      { pageX: 0, pageY: 0 },
      { pageX: 0, pageY: 180 },
    ],
    { minZoom: 0.5, maxZoom: 4 }
  );

  assert.equal(nextZoom, 1.8);
});

test("resolvePinchZoomChange clamps zoom to the configured bounds", () => {
  const session = {
    initialDistance: 100,
    initialZoom: 1,
  };

  const nextZoom = pinchZoom.resolvePinchZoomChange(
    session,
    [
      { pageX: 0, pageY: 0 },
      { pageX: 0, pageY: 900 },
    ],
    { minZoom: 0.5, maxZoom: 4 }
  );

  assert.equal(nextZoom, 4);
});

test("resolvePinchPreviewScale converts the preview zoom into a local scale ratio", () => {
  assert.equal(pinchZoom.resolvePinchPreviewScale(1.5, 1.5), 1);
  assert.equal(pinchZoom.resolvePinchPreviewScale(1.5, 2.25), 1.5);
  assert.equal(pinchZoom.resolvePinchPreviewScale(2, 1), 0.5);
});

test("sanitizePinchPreviewScale falls back to 1 for invalid values", () => {
  assert.equal(pinchZoom.sanitizePinchPreviewScale(1.75), 1.75);
  assert.equal(pinchZoom.sanitizePinchPreviewScale(Number.NaN), 1);
  assert.equal(
    pinchZoom.sanitizePinchPreviewScale(Number.POSITIVE_INFINITY),
    1
  );
  assert.equal(pinchZoom.sanitizePinchPreviewScale(0), 1);
  assert.equal(pinchZoom.sanitizePinchPreviewScale(-2), 1);
});

test("resolvePinchGestureZoom scales and clamps a global pinch update", () => {
  assert.equal(pinchZoom.resolvePinchGestureZoom(1, 1.8), 1.8);
  assert.equal(pinchZoom.resolvePinchGestureZoom(2, 0.4), 0.8);
  assert.equal(pinchZoom.resolvePinchGestureZoom(2, 0.1), 0.5);
  assert.equal(pinchZoom.resolvePinchGestureZoom(3, 2), 4);
});

test("resolveAnchoredViewportOffset preserves the focal point across content resize", () => {
  assert.equal(
    pinchZoom.resolveAnchoredViewportOffset({
      viewportOffset: 120,
      startScrollOffset: 0,
      startItemOffset: 0,
      startItemLength: 800,
      endItemOffset: 0,
      endItemLength: 1600,
      viewportLength: 400,
      endContentLength: 1600,
    }),
    120
  );

  assert.equal(
    pinchZoom.resolveAnchoredViewportOffset({
      viewportOffset: 150,
      startScrollOffset: 300,
      startItemOffset: 200,
      startItemLength: 1000,
      endItemOffset: 260,
      endItemLength: 1400,
      viewportLength: 500,
      endContentLength: 2200,
    }),
    460
  );
});

test("resolveAnchoredDocumentOffset preserves an absolute focal point across document resize", () => {
  assert.equal(
    pinchZoom.resolveAnchoredDocumentOffset({
      viewportOffset: 240,
      startScrollOffset: 360,
      startContentLength: 1200,
      endContentLength: 1800,
      viewportLength: 600,
    }),
    660
  );

  assert.equal(
    pinchZoom.resolveAnchoredDocumentOffset({
      viewportOffset: 240,
      startScrollOffset: 0,
      startContentLength: 500,
      endContentLength: 500,
      viewportLength: 600,
    }),
    0
  );
});

test("resolveClampedScrollOffset keeps a shared horizontal position inside page bounds", () => {
  assert.equal(pinchZoom.resolveClampedScrollOffset(120, 800, 400), 120);
  assert.equal(pinchZoom.resolveClampedScrollOffset(260, 500, 400), 100);
  assert.equal(pinchZoom.resolveClampedScrollOffset(-30, 500, 400), 0);
});

test("resolveDocumentSurfaceWidth grows a shared horizontal surface only when zoomed content overflows", () => {
  assert.equal(
    pinchZoom.resolveDocumentSurfaceWidth({
      viewportWidth: 400,
      contentWidth: 320,
      horizontalPadding: 16,
    }),
    400
  );
  assert.equal(
    pinchZoom.resolveDocumentSurfaceWidth({
      viewportWidth: 400,
      contentWidth: 520,
      horizontalPadding: 16,
    }),
    552
  );
});

test("resolveGlobalHorizontalOffset recenters when content fits and clamps when it overflows", () => {
  assert.equal(
    pinchZoom.resolveGlobalHorizontalOffset({
      offsetX: 80,
      surfaceWidth: 400,
      viewportWidth: 400,
    }),
    0
  );
  assert.equal(
    pinchZoom.resolveGlobalHorizontalOffset({
      offsetX: 180,
      surfaceWidth: 620,
      viewportWidth: 400,
    }),
    180
  );
  assert.equal(
    pinchZoom.resolveGlobalHorizontalOffset({
      offsetX: 260,
      surfaceWidth: 620,
      viewportWidth: 400,
    }),
    220
  );
});

test("resolveAnchoredHorizontalSurfaceOffset preserves a focal point inside the document surface", () => {
  assert.equal(
    pinchZoom.resolveAnchoredHorizontalSurfaceOffset({
      focalViewportX: 220,
      startSurfaceScrollX: 160,
      startSurfaceWidth: 760,
      endSurfaceWidth: 1040,
      viewportWidth: 400,
    }),
    300
  );

  assert.equal(
    pinchZoom.resolveAnchoredHorizontalSurfaceOffset({
      focalViewportX: 120,
      startSurfaceScrollX: 40,
      startSurfaceWidth: 400,
      endSurfaceWidth: 400,
      viewportWidth: 400,
    }),
    0
  );
});

test("resolveCenteredContentInset provides visual centering without scroll overflow", () => {
  assert.equal(
    pinchZoom.resolveCenteredContentInset({
      viewportLength: 400,
      contentLength: 320,
    }),
    40
  );
  assert.equal(
    pinchZoom.resolveCenteredContentInset({
      viewportLength: 400,
      contentLength: 520,
    }),
    0
  );
});

test("shouldSuppressPressAfterPinch only blocks presses inside the safety window", () => {
  assert.equal(
    pinchZoom.shouldSuppressPressAfterPinch(1_000, 1_060, 120),
    true
  );
  assert.equal(
    pinchZoom.shouldSuppressPressAfterPinch(1_000, 1_200, 120),
    false
  );
  assert.equal(
    pinchZoom.shouldSuppressPressAfterPinch(null, 1_060, 120),
    false
  );
});

test("pinch interaction keeps preview separate from the committed document zoom", () => {
  const session = pinchZoom.createPinchInteraction({
    committedZoom: 1,
    focalX: 180,
    focalY: 320,
    startScrollX: 40,
    startScrollY: 260,
  });

  const preview = pinchZoom.updatePinchInteraction(session, 1.75);

  assert.equal(preview.committedZoom, 1);
  assert.equal(preview.previewZoom, 1.75);
  assert.equal(preview.commitCount, 0);
  assert.deepEqual(preview.focalPoint, { x: 180, y: 320 });
});

test("pinch interaction commits once and finalizes idempotently", () => {
  const session = pinchZoom.createPinchInteraction({
    committedZoom: 1.25,
    focalX: 120,
    focalY: 240,
    startScrollX: 12,
    startScrollY: 340,
  });
  const preview = pinchZoom.updatePinchInteraction(session, 2.5);

  const committed = pinchZoom.finishPinchInteraction(preview, "end");
  const duplicate = pinchZoom.finishPinchInteraction(committed, "finalize");

  assert.equal(committed.outcome, "commit");
  assert.equal(committed.committedZoom, 2.5);
  assert.equal(committed.commitCount, 1);
  assert.equal(duplicate.commitCount, 1);
  assert.equal(duplicate.outcome, "commit");
});

test("cancelled pinch restores the initial zoom without a document commit", () => {
  const session = pinchZoom.createPinchInteraction({
    committedZoom: 2,
    focalX: 200,
    focalY: 180,
    startScrollX: 90,
    startScrollY: 120,
  });
  const preview = pinchZoom.updatePinchInteraction(session, 3.5);
  const cancelled = pinchZoom.finishPinchInteraction(preview, "cancel");

  assert.equal(cancelled.outcome, "cancel");
  assert.equal(cancelled.previewZoom, 2);
  assert.equal(cancelled.committedZoom, 2);
  assert.equal(cancelled.commitCount, 0);
});

test("pinch interaction preserves focal point and clamps final zoom", () => {
  const session = pinchZoom.createPinchInteraction({
    committedZoom: 1,
    focalX: 220,
    focalY: 300,
    startScrollX: 160,
    startScrollY: 420,
  });
  const preview = pinchZoom.updatePinchInteraction(session, 8, {
    minZoom: 0.5,
    maxZoom: 4,
  });
  const committed = pinchZoom.finishPinchInteraction(preview, "end");

  assert.equal(committed.committedZoom, 4);
  assert.deepEqual(committed.focalPoint, { x: 220, y: 300 });
  assert.equal(committed.startScrollX, 160);
  assert.equal(committed.startScrollY, 420);
});
