import { describe, expect, it, vi } from "vitest";
import { reconcileInkAnnotationsForPage } from "./inkAnnotations";
import type { Annotation, InkStrokeCommit } from "@papyrus-sdk/types";

const ink = (
  id: string,
  path: { x: number; y: number }[],
  pageIndex = 3
): Annotation => ({
  id,
  type: "ink",
  pageIndex,
  rect: { x: 0, y: 0, width: 0.5, height: 0.5 },
  path,
  color: "#111827",
  opacity: 1,
  strokeWidth: 0.004,
  createdAt: 100,
});

const stroke = (path: InkStrokeCommit["path"]): InkStrokeCommit => ({
  path,
  color: "#111827",
  opacity: 1,
  strokeWidth: 0.004,
});

describe("reconcileInkAnnotationsForPage", () => {
  it("normalizes bounds and retains ids for unchanged strokes", () => {
    const old = ink("existing", [
      { x: 0.2, y: 0.3 },
      { x: 0.7, y: 0.8 },
    ]);
    const result = reconcileInkAnnotationsForPage(
      [old],
      3,
      [stroke(old.path!)],
      200,
      () => "new-id"
    );

    expect(result).toEqual([
      {
        ...old,
        rect: { x: 0.2, y: 0.3, width: 0.5, height: 0.5 },
      },
    ]);
  });

  it("reuses unchanged ids and gives new ids to erased fragments", () => {
    const unchanged = ink("keep", [
      { x: 0.1, y: 0.1 },
      { x: 0.2, y: 0.2 },
    ]);
    const erased = ink("erase", [
      { x: 0.4, y: 0.4 },
      { x: 0.8, y: 0.8 },
    ]);
    const makeId = vi
      .fn<() => string>()
      .mockReturnValueOnce("fragment-a")
      .mockReturnValueOnce("fragment-b");
    const result = reconcileInkAnnotationsForPage(
      [unchanged, erased],
      3,
      [
        stroke(unchanged.path!),
        stroke([
          { x: 0.42, y: 0.42 },
          { x: 0.5, y: 0.5 },
        ]),
        stroke([
          { x: 0.7, y: 0.7 },
          { x: 0.78, y: 0.78 },
        ]),
      ],
      200,
      makeId
    );

    expect(result.map(({ id }) => id)).toEqual([
      "keep",
      "fragment-a",
      "fragment-b",
    ]);
    expect(result.slice(1).map(({ rect }) => rect)).toEqual([
      { x: 0.42, y: 0.42, width: 0.08, height: 0.08 },
      { x: 0.7, y: 0.7, width: 0.08, height: 0.08 },
    ]);
  });

  it("does not reuse ids from other pages or non-ink annotations", () => {
    const samePath = [
      { x: 0.2, y: 0.2 },
      { x: 0.3, y: 0.3 },
    ];
    const oldMarkup: Annotation = {
      ...ink("markup", samePath),
      type: "highlight",
    };
    const oldOtherPage = ink("other-page", samePath, 4);

    const result = reconcileInkAnnotationsForPage(
      [oldMarkup, oldOtherPage],
      3,
      [stroke(samePath)],
      200,
      () => "new-current-page-ink"
    );

    expect(result[0]?.id).toBe("new-current-page-ink");
  });
});
