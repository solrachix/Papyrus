export const promoteWebRenderSurface = ({
  visibleCanvas,
  nextCanvas,
  visibleTextLayer,
  nextTextLayer,
}: {
  visibleCanvas: HTMLCanvasElement;
  nextCanvas: HTMLCanvasElement;
  visibleTextLayer: HTMLElement;
  nextTextLayer: HTMLElement;
}) => {
  visibleCanvas.width = nextCanvas.width;
  visibleCanvas.height = nextCanvas.height;
  visibleCanvas.getContext("2d")?.drawImage(nextCanvas, 0, 0);
  visibleTextLayer.style.cssText = nextTextLayer.style.cssText;
  visibleTextLayer.replaceChildren(...Array.from(nextTextLayer.childNodes));
};
