export const shouldRemoveThumbnailClipping = ({
  useNativePreview,
}: {
  useNativePreview: boolean;
}): boolean => !useNativePreview;
