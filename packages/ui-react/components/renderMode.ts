import type { DocumentEngine } from "@papyrus-sdk/types";

type LayoutEngine = Pick<
  DocumentEngine,
  "getRenderTargetType" | "getPageLayoutMode"
>;

export const isContinuousElementMode = (engine: LayoutEngine): boolean => {
  return (
    engine.getRenderTargetType?.() === "element" &&
    engine.getPageLayoutMode?.() === "continuous"
  );
};

export const isSingleViewportMode = (engine: LayoutEngine): boolean => {
  const renderTargetType = engine.getRenderTargetType?.() ?? "canvas";
  return (
    (renderTargetType === "element" || renderTargetType === "webview") &&
    !isContinuousElementMode(engine)
  );
};
