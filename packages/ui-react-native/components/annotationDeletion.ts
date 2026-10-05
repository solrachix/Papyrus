import type { Annotation } from "@papyrus-sdk/types";

const MARKUP_ANNOTATION_TYPES: ReadonlySet<Annotation["type"]> = new Set([
  "highlight",
  "underline",
  "strikeout",
  "squiggly",
]);

export function resolveMarkupAnnotationDeleteFallback(
  annotations: readonly Annotation[],
  selectedAnnotationId: string | null,
  hasNativeEditMenu: boolean
): Annotation | null {
  if (!selectedAnnotationId || hasNativeEditMenu) return null;

  const selected = annotations.find(
    (annotation) => annotation.id === selectedAnnotationId
  );
  return selected && MARKUP_ANNOTATION_TYPES.has(selected.type)
    ? selected
    : null;
}

export function deleteAnnotationAndClearSelection(
  annotationId: string,
  removeAnnotation: (id: string) => void,
  setSelectedAnnotation: (id: string | null) => void
): void {
  removeAnnotation(annotationId);
  setSelectedAnnotation(null);
}
