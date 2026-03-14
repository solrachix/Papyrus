import test from "node:test";
import assert from "node:assert/strict";

const modulePath = new URL(
  "../dist/gesture/selectionInteraction.mjs",
  import.meta.url
);
const selectionInteraction = await import(modulePath);

test("shouldEnableViewerScroll disables outer scroll only during active selection drag", () => {
  assert.equal(
    selectionInteraction.shouldEnableViewerScroll({
      selectionDragActive: false,
    }),
    true
  );
  assert.equal(
    selectionInteraction.shouldEnableViewerScroll({
      selectionDragActive: true,
    }),
    false
  );
  assert.equal(
    selectionInteraction.shouldEnableViewerScroll({
      selectionDragActive: false,
      gestureScrollLockActive: true,
    }),
    false
  );
});

test("shouldEnableSelectionDrag requires explicit select mode but keeps markup tools armed", () => {
  assert.equal(
    selectionInteraction.shouldEnableSelectionDrag({
      activeTool: "select",
      interactionMode: "pan",
    }),
    false
  );
  assert.equal(
    selectionInteraction.shouldEnableSelectionDrag({
      activeTool: "select",
      interactionMode: "select",
    }),
    true
  );
  assert.equal(
    selectionInteraction.shouldEnableSelectionDrag({
      activeTool: "highlight",
      interactionMode: "pan",
    }),
    true
  );
});

test("isToolDockToolSelected only marks select as active after explicit arming", () => {
  assert.equal(
    selectionInteraction.isToolDockToolSelected({
      toolId: "select",
      activeTool: "select",
      interactionMode: "pan",
    }),
    false
  );
  assert.equal(
    selectionInteraction.isToolDockToolSelected({
      toolId: "select",
      activeTool: "select",
      interactionMode: "select",
    }),
    true
  );
  assert.equal(
    selectionInteraction.isToolDockToolSelected({
      toolId: "highlight",
      activeTool: "highlight",
      interactionMode: "pan",
    }),
    true
  );
});

test("getToolDockDismissState disarms active select mode when the dock closes", () => {
  assert.deepEqual(
    selectionInteraction.getToolDockDismissState({
      activeTool: "select",
      interactionMode: "select",
    }),
    {
      toolDockOpen: false,
      activeTool: "select",
      interactionMode: "pan",
    }
  );

  assert.deepEqual(
    selectionInteraction.getToolDockDismissState({
      activeTool: "highlight",
      interactionMode: "pan",
    }),
    {
      toolDockOpen: false,
      activeTool: "highlight",
      interactionMode: "pan",
    }
  );
});

test("getSelectionEdgeAutoscroll returns no movement away from edges", () => {
  assert.deepEqual(
    selectionInteraction.getSelectionEdgeAutoscroll({
      x: 120,
      y: 240,
      width: 400,
      height: 800,
      threshold: 48,
      maxStep: 24,
    }),
    { dx: 0, dy: 0 }
  );
});

test("getSelectionEdgeAutoscroll accelerates toward the closest edge", () => {
  assert.deepEqual(
    selectionInteraction.getSelectionEdgeAutoscroll({
      x: 12,
      y: 790,
      width: 400,
      height: 800,
      threshold: 48,
      maxStep: 24,
    }),
    { dx: -18, dy: 19 }
  );
});

test("getSelectionEdgeAutoscroll clamps to the maximum step near corners", () => {
  assert.deepEqual(
    selectionInteraction.getSelectionEdgeAutoscroll({
      x: 0,
      y: 0,
      width: 400,
      height: 800,
      threshold: 48,
      maxStep: 24,
    }),
    { dx: -24, dy: -24 }
  );
});
