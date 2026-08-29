export type PageTapChromeContext = {
  chromeVisible: boolean;
  selectionActive?: boolean;
  annotationHit?: boolean;
  pinchActive?: boolean;
  toolActive?: boolean;
  contentInteraction?: boolean;
};

export const resolvePageTapChromeVisibility = ({
  chromeVisible,
  selectionActive = false,
  annotationHit = false,
  pinchActive = false,
  toolActive = false,
  contentInteraction = false,
}: PageTapChromeContext): boolean | null => {
  if (
    selectionActive ||
    annotationHit ||
    pinchActive ||
    toolActive ||
    contentInteraction
  ) {
    return null;
  }
  return !chromeVisible;
};
