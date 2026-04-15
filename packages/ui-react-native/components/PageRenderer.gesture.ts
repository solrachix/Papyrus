export interface BuildCommentTapGestureDepsParams {
  isNative: boolean;
  resolvedActiveTool: string;
  layoutWidth: number;
  layoutHeight: number;
  annotationColor: string;
  annotationOpacity: number;
  inkStrokeWidth: number;
  addAnnotationAt: (...args: unknown[]) => unknown;
}

export const buildCommentTapGestureDeps = ({
  isNative,
  resolvedActiveTool,
  layoutWidth,
  layoutHeight,
  annotationColor,
  annotationOpacity,
  inkStrokeWidth,
  addAnnotationAt,
}: BuildCommentTapGestureDepsParams) =>
  [
    isNative,
    resolvedActiveTool,
    layoutWidth,
    layoutHeight,
    annotationColor,
    annotationOpacity,
    inkStrokeWidth,
    addAnnotationAt,
  ] as const;
