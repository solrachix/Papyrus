import type { ViewMode } from "@papyrus-sdk/types";

export type ProgressPillMode =
  | { kind: "scrubber" }
  | {
      kind: "navigation";
      previousPage: number | null;
      nextPage: number | null;
    };

export function resolveProgressPillMode(
  viewMode: ViewMode,
  currentPage: number,
  pageCount: number
): ProgressPillMode {
  if (viewMode !== "single") return { kind: "scrubber" };
  const total = Math.max(0, Math.trunc(pageCount));
  const page =
    total > 0 ? Math.min(total, Math.max(1, Math.trunc(currentPage))) : 1;
  return {
    kind: "navigation",
    previousPage: page > 1 ? page - 1 : null,
    nextPage: page < total ? page + 1 : null,
  };
}
