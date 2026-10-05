import type { Annotation, InkStrokeCommit } from "@papyrus-sdk/types";

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const quantize = (value: number) => Math.round(value * 100_000) / 100_000;

const normalizedPath = (path: InkStrokeCommit["path"]) => {
  const points = path
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
    .map((point) => ({
      x: quantize(clamp01(point.x)),
      y: quantize(clamp01(point.y)),
    }));
  if (points.length === 1) points.push({ ...points[0]! });
  return points;
};

const getInkSignature = (
  annotation: Pick<
    Annotation,
    "pageIndex" | "type" | "path" | "color" | "opacity" | "strokeWidth"
  >
) =>
  JSON.stringify({
    pageIndex: annotation.pageIndex,
    type: annotation.type,
    path: (annotation.path ?? []).map(({ x, y }) => [quantize(x), quantize(y)]),
    color: annotation.color.toLowerCase(),
    opacity: quantize(annotation.opacity ?? 1),
    strokeWidth: quantize(annotation.strokeWidth ?? 0.006),
  });

const getRect = (path: InkStrokeCommit["path"]) => {
  let minX = 1;
  let minY = 1;
  let maxX = 0;
  let maxY = 0;
  for (const { x, y } of path) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return {
    x: minX,
    y: minY,
    width: quantize(Math.max(0.0005, maxX - minX)),
    height: quantize(Math.max(0.0005, maxY - minY)),
  };
};

export const reconcileInkAnnotationsForPage = (
  existingAnnotations: readonly Annotation[],
  pageIndex: number,
  strokes: readonly InkStrokeCommit[],
  createdAt = Date.now(),
  createId = () =>
    `ink_${createdAt.toString(36)}_${Math.random().toString(36).slice(2, 11)}`
): Annotation[] => {
  const existingBySignature = new Map<string, Annotation[]>();
  for (const annotation of existingAnnotations) {
    if (
      annotation.type !== "ink" ||
      annotation.pageIndex !== pageIndex ||
      !annotation.path?.length
    ) {
      continue;
    }
    const signature = getInkSignature(annotation);
    const matches = existingBySignature.get(signature) ?? [];
    matches.push(annotation);
    existingBySignature.set(signature, matches);
  }

  const reconciled: Annotation[] = [];
  for (const stroke of strokes) {
    const path = normalizedPath(stroke.path);
    if (path.length < 2) continue;
    const color = stroke.color.trim() || "#111827";
    const opacity = Number.isFinite(stroke.opacity)
      ? Math.min(1, Math.max(0, stroke.opacity))
      : 1;
    const strokeWidth = Number.isFinite(stroke.strokeWidth)
      ? Math.max(0.0001, stroke.strokeWidth)
      : 0.006;
    const candidate = {
      pageIndex,
      type: "ink" as const,
      path,
      color,
      opacity,
      strokeWidth,
    };
    const signature = getInkSignature(candidate);
    const previous = existingBySignature.get(signature)?.shift();
    reconciled.push({
      ...(previous ?? {}),
      id: previous?.id ?? createId(),
      type: "ink",
      pageIndex,
      rect: getRect(path),
      path,
      color,
      opacity,
      strokeWidth,
      createdAt: previous?.createdAt ?? createdAt,
    });
  }
  return reconciled;
};
